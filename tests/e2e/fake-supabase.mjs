// A small stand-in for Supabase's HTTP APIs, backed by the real schema.sql in embedded Postgres.
// The real supabase-js client talks to it, so column names, RPC arguments, row level security,
// triggers and constraints are all exercised for real. Only the HTTP layer is imitated.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, password text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to service_role;
`;

const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Bad identifier: ${name}`);
  return `"${name}"`;
};

function makeJwt(sub, role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub, role, exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
}

function readJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

export async function startFakeSupabase({ port, schemaPath, serviceKey }) {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(readFileSync(schemaPath, 'utf8'));
  const files = new Map();
  const requests = [];

  async function asUser(claims, work) {
    return db.transaction(async (tx) => {
      await tx.exec(`set local role ${claims.role}`);
      await tx.query(`select set_config('request.jwt.sub', $1, true)`, [claims.sub ?? '']);
      return work(tx);
    });
  }

  function claimsOf(req) {
    const key = req.headers.apikey;
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (bearer === serviceKey || key === serviceKey) return { role: 'service_role' };
    const jwt = readJwt(bearer);
    return jwt?.sub ? { role: 'authenticated', sub: jwt.sub } : { role: 'anon' };
  }

  function whereClause(url, startAt) {
    const parts = [];
    const params = [];
    for (const [column, raw] of url.searchParams) {
      if (['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'].includes(column)) continue;
      if (raw.startsWith('gte.')) {
        // Timestamps and numbers compare as themselves, not as text.
        params.push(raw.slice(4));
        parts.push(`${ident(column)} >= $${startAt + params.length}`);
        continue;
      }
      if (!raw.startsWith('eq.')) throw new Error(`Unsupported filter ${column}=${raw}`);
      params.push(raw.slice(3));
      parts.push(`${ident(column)}::text = $${startAt + params.length}`);
    }
    return { sql: parts.length ? ` where ${parts.join(' and ')}` : '', params };
  }

  async function rest(req, res, url, body) {
    const path = url.pathname.replace('/rest/v1/', '');
    const claims = claimsOf(req);
    const wantsObject = (req.headers.accept ?? '').includes('vnd.pgrst.object');
    const send = (rows) => {
      if (wantsObject) {
        if (rows.length > 1) return json(res, 406, { message: 'More than one row' });
        if (rows.length === 0) return json(res, 406, { code: 'PGRST116', message: 'No rows' });
        return json(res, 200, rows[0]);
      }
      json(res, 200, rows);
    };

    if (path.startsWith('rpc/')) {
      const fn = ident(path.slice(4));
      const keys = Object.keys(body ?? {});
      const args = keys.map((key, i) => {
        const value = body[key];
        const isObject = value !== null && typeof value === 'object';
        return `${ident(key)} => $${i + 1}${isObject ? '::jsonb' : ''}`;
      });
      const params = keys.map((key) => (body[key] !== null && typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key]));
      const rows = await asUser(claims, (tx) => tx.query(`select public.${fn}(${args.join(', ')}) as result`, params));
      return json(res, 200, rows.rows[0].result);
    }

    const table = `public.${ident(path)}`;
    const returning = (req.headers.prefer ?? '').includes('return=representation');

    if (req.method === 'GET') {
      const columns = url.searchParams.get('select');
      const list = !columns || columns === '*' ? '*' : columns.split(',').map(ident).join(', ');
      const { sql, params } = whereClause(url, 0);
      let query = `select ${list} from ${table}${sql}`;
      const order = url.searchParams.get('order');
      if (order) {
        query += ` order by ${order.split(',').map((item) => {
          const [column, direction] = item.split('.');
          return `${ident(column)} ${direction === 'desc' ? 'desc' : 'asc'}`;
        }).join(', ')}`;
      }
      if (url.searchParams.get('limit')) query += ` limit ${Number(url.searchParams.get('limit'))}`;
      if (url.searchParams.get('offset')) query += ` offset ${Number(url.searchParams.get('offset'))}`;
      const rows = await asUser(claims, (tx) => tx.query(query, params));
      return send(rows.rows);
    }

    if (req.method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const list = columns.map(ident).join(', ');
      let query = `insert into ${table} (${list}) select ${list} from jsonb_populate_recordset(null::${table}, $1::jsonb)`;
      const conflict = url.searchParams.get('on_conflict');
      if (conflict) {
        query += ` on conflict (${ident(conflict)}) do update set ${columns.filter((c) => c !== conflict).map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ')}`;
      }
      query += ' returning *';
      const result = await asUser(claims, (tx) => tx.query(query, [JSON.stringify(rows)]));
      return returning ? json(res, 201, result.rows) : json(res, 201, null);
    }

    if (req.method === 'PATCH') {
      const columns = Object.keys(body);
      const list = columns.map(ident).join(', ');
      const { sql, params } = whereClause(url, 1);
      const query = `update ${table} set (${list}) = row(${columns.map((c) => `(jsonb_populate_record(null::${table}, $1::jsonb)).${ident(c)}`).join(', ')})${sql} returning *`;
      const result = await asUser(claims, (tx) => tx.query(query, [JSON.stringify(body), ...params]));
      return returning ? send(result.rows) : json(res, 200, null);
    }

    if (req.method === 'DELETE') {
      const { sql, params } = whereClause(url, 0);
      await asUser(claims, (tx) => tx.query(`delete from ${table}${sql}`, params));
      return json(res, 200, null);
    }
    return json(res, 405, { message: 'Method not allowed' });
  }

  async function auth(req, res, url, body) {
    if (url.pathname.endsWith('/token')) {
      const found = await db.query('select id, email from auth.users where email = $1 and password = $2', [body.email, body.password]);
      const user = found.rows[0];
      if (!user) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return json(res, 200, {
        access_token: makeJwt(user.id, 'authenticated'),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'refresh',
        user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
      });
    }
    if (url.pathname.endsWith('/user')) {
      const jwt = readJwt((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
      if (!jwt?.sub) return json(res, 401, { message: 'Invalid token' });
      return json(res, 200, { id: jwt.sub, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    }
    if (url.pathname.endsWith('/logout')) return json(res, 204, null);
    return json(res, 404, { message: 'Not found' });
  }

  async function storage(req, res, url, raw, body) {
    const claims = claimsOf(req);
    const signMatch = /^\/storage\/v1\/object\/sign\/([^/]+)(?:\/(.+))?$/.exec(url.pathname);
    if (signMatch && req.method === 'POST') {
      const visible = await asUser(claims, (tx) => tx.query('select name from storage.objects where bucket_id = $1 and name = any($2::text[])', [signMatch[1], body.paths]));
      const allowed = new Set(visible.rows.map((row) => row.name));
      return json(res, 200, body.paths.map((path) => (
        allowed.has(path)
          ? { path, signedURL: `/object/sign/${signMatch[1]}/${path}?token=t`, error: null }
          : { path, signedURL: null, error: 'Either the object does not exist or you do not have access to it' }
      )));
    }
    if (signMatch && req.method === 'GET') {
      const file = files.get(decodeURIComponent(signMatch[2]));
      if (!file) return json(res, 404, { message: 'Not found' });
      res.writeHead(200, { 'content-type': file.type, 'access-control-allow-origin': '*' });
      return res.end(file.bytes);
    }
    const upload = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (upload && req.method === 'POST') {
      const name = decodeURIComponent(upload[2]);
      await asUser(claims, (tx) => tx.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [upload[1], name]));
      files.set(name, { bytes: raw, type: req.headers['content-type'] ?? 'application/octet-stream' });
      return json(res, 200, { Key: `${upload[1]}/${name}`, Id: name });
    }
    return json(res, 404, { message: 'Not found' });
  }

  // Imitates Gemini: refuses the "bad" key, otherwise answers with whatever the test queued.
  const geminiCalls = [];
  const geminiReplies = [];
  function gemini(req, res, url, body) {
    const key = req.headers['x-goog-api-key'] ?? url.searchParams.get('key');
    geminiCalls.push({ key, path: url.pathname, body });
    if (key === 'bad-key') return json(res, 400, { error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT' } });
    const reply = geminiReplies.shift() ?? {};
    json(res, 200, { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] });
  }

  function json(res, status, value) {
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(value === null ? '' : JSON.stringify(value));
  }

  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-headers', '*');
      res.setHeader('access-control-allow-methods', '*');
      res.setHeader('access-control-expose-headers', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }
      const url = new URL(req.url, `http://localhost:${port}`);
      const raw = Buffer.concat(chunks);
      let body = null;
      if ((req.headers['content-type'] ?? '').includes('json') && raw.length) body = JSON.parse(raw.toString());
      // The client sends uploads as multipart; pull the file out so it can be served back intact.
      let fileBytes = raw;
      const boundary = /boundary=(.+)$/.exec(req.headers['content-type'] ?? '')?.[1];
      if (boundary) {
        const start = raw.indexOf('\r\n\r\n', raw.lastIndexOf(`name=""`) > -1 ? raw.lastIndexOf(`name=""`) : 0) + 4;
        const end = raw.lastIndexOf(`\r\n--${boundary}`);
        fileBytes = raw.subarray(start, end);
      }
      requests.push({ method: req.method, path: url.pathname, role: claimsOf(req).role });
      try {
        if (url.pathname.includes(':generateContent')) gemini(req, res, url, body);
        else if (url.pathname.startsWith('/rest/v1/')) await rest(req, res, url, body);
        else if (url.pathname.startsWith('/auth/v1/')) await auth(req, res, url, body);
        else if (url.pathname.startsWith('/storage/v1/')) await storage(req, res, url, fileBytes, body);
        else json(res, 404, { message: 'Not found' });
      } catch (error) {
        const denied = /row-level security|permission denied/.test(error.message);
        json(res, denied ? 403 : 400, { message: error.message, code: error.code });
      }
    });
  });

  await new Promise((resolve) => server.listen(port, resolve));

  return {
    db,
    files,
    requests,
    geminiCalls,
    geminiReplies,
    async addUser(email, password) {
      await db.query('insert into auth.users (email, password) values ($1, $2)', [email, password]);
    },
    stop: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}
