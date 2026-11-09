import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '../../types';
import { BackendError, type Backend, type ListOptions, type PresenceEntry, type RpcName, type TableName } from './types';

const BUCKET = 'candidate-files';
const PAGE_SIZE = 1000;
const SIGNED_URL_SECONDS = 60 * 60;

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new BackendError(result.error.message);
  return result.data as T;
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const client: SupabaseClient = createClient(url, anonKey);

  return {
    mode: 'supabase',

    async currentUser() {
      const { data } = await client.auth.getSession();
      const id = data.session?.user.id;
      if (!id) return null;
      return unwrap(await client.from('profiles').select('*').eq('id', id).maybeSingle()) as Profile | null;
    },

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new BackendError(error.message);
    },

    async signOut() {
      await client.auth.signOut();
    },

    onAuthChange(callback) {
      const { data } = client.auth.onAuthStateChange((event) => {
        // Token refreshes fire here too and must not reload the whole app.
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          // Supabase holds an auth lock during this callback; querying inside it would deadlock.
          setTimeout(callback, 0);
        }
      });
      return () => data.subscription.unsubscribe();
    },

    async accessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },

    async list<T>(table: TableName, options: ListOptions = {}) {
      // The API returns at most 1000 rows per request, so read page by page.
      const rows: T[] = [];
      const wanted = options.limit ?? Infinity;
      for (let from = 0; ; from += PAGE_SIZE) {
        let query = client.from(table).select(options.select ?? '*');
        for (const [column, value] of Object.entries(options.match ?? {})) query = query.eq(column, value);
        if (options.since) query = query.gte(options.since.column, options.since.value);
        // A stable order is required, otherwise rows can repeat or vanish between pages.
        if (options.order) query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
        const size = Math.min(PAGE_SIZE, wanted - from);
        const page = unwrap(await query.range(from, from + size - 1)) as T[];
        rows.push(...page);
        if (page.length < size || rows.length >= wanted) return rows;
      }
    },

    async get<T>(table: TableName, match: Record<string, string | number>) {
      let query = client.from(table).select('*');
      for (const [column, value] of Object.entries(match)) query = query.eq(column, value);
      return unwrap(await query.maybeSingle()) as T | null;
    },

    async insert<T>(table: TableName, rows: object[]) {
      return unwrap(await client.from(table).insert(rows).select()) as T[];
    },

    async update<T>(table: TableName, match: Record<string, string | number>, patch: object) {
      let query = client.from(table).update(patch);
      for (const [column, value] of Object.entries(match)) query = query.eq(column, value);
      return unwrap(await query.select()) as T[];
    },

    async upsert<T>(table: TableName, rows: object[], conflictColumn: string) {
      return unwrap(await client.from(table).upsert(rows, { onConflict: conflictColumn }).select()) as T[];
    },

    async remove(table: TableName, match: Record<string, string | number>) {
      let query = client.from(table).delete();
      for (const [column, value] of Object.entries(match)) query = query.eq(column, value);
      unwrap(await query);
    },

    async rpc<T>(name: RpcName, args: Record<string, unknown>) {
      return unwrap(await client.rpc(name, args)) as T;
    },

    async upload(path, file, contentType) {
      const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
      if (error) throw new BackendError(error.message);
    },

    async removeFiles(paths) {
      for (let i = 0; i < paths.length; i += 500) {
        const { error } = await client.storage.from(BUCKET).remove(paths.slice(i, i + 500));
        if (error) throw new BackendError(error.message);
      }
    },

    async signedUrls(paths) {
      if (paths.length === 0) return {};
      const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
      if (error) throw new BackendError(error.message);
      const urls: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
      }
      return urls;
    },

    subscribe(callback) {
      // supabase-js hands back an existing channel of the same name, which cannot take new listeners once
      // subscribed: each subscriber gets a channel of its own.
      const channel = client
        .channel(`app-changes-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => callback(payload.table))
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },

    presence(onChange) {
      const channel = presenceChannel();
      presence.listeners.add(onChange);
      if (presence.joined) onChange(presenceEntries(channel));
      return {
        update(entry) {
          presence.mine = entry;
          if (presence.joined) void channel.track(entry);
        },
        stop() {
          presence.listeners.delete(onChange);
          if (presence.listeners.size === 0) {
            presence.mine = null;
            if (presence.joined) void channel.untrack();
          }
        },
      };
    },
  };

  // Everyone shares one presence topic, so this tab joins it once and keeps it: leaving and rejoining the same
  // topic at once would hand back the channel still on its way out.
  function presenceChannel(): RealtimeChannel {
    if (presence.channel) return presence.channel;
    const channel = client.channel('team-presence', { config: { presence: { key: crypto.randomUUID() } } });
    presence.channel = channel;
    channel
      .on('presence', { event: 'sync' }, () => {
        const entries = presenceEntries(channel);
        presence.listeners.forEach((listener) => listener(entries));
      })
      .subscribe((status) => {
        presence.joined = status === 'SUBSCRIBED';
        if (presence.joined && presence.mine) void channel.track(presence.mine);
      });
    return channel;
  }
}

const presence: {
  channel: RealtimeChannel | null;
  joined: boolean;
  mine: PresenceEntry | null;
  listeners: Set<(entries: PresenceEntry[]) => void>;
} = { channel: null, joined: false, mine: null, listeners: new Set() };

function presenceEntries(channel: RealtimeChannel): PresenceEntry[] {
  return Object.values(channel.presenceState<PresenceEntry>()).flat().map(({ presence_ref: _ref, ...entry }) => entry as PresenceEntry);
}
