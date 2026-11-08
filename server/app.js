// @ts-check
// The API routes, shared by the local server (server/index.ts) and the Vercel function (api/index.js).
import express from 'express';
import rateLimit from 'express-rate-limit';
import { aiStatus, authorize, parseCv, ParseError } from './ai.js';

export const app = express();
app.disable('x-powered-by');
// One reverse proxy in front (Vercel, nginx, Render) so rate limits see the real client address.
app.set('trust proxy', 1);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// On Vercel every function instance keeps its own count, so this is a brake, not an exact limit.
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false });

app.get('/api/ai/status', aiLimiter, async (req, res) => {
  try {
    const context = await authorize(req.headers.authorization, req.headers['x-demo-ai-key']);
    res.json(await aiStatus(context));
  } catch (error) {
    sendError(res, error);
  }
});

// A CV file arrives base64 encoded. Vercel caps a request at 4.5 MB, and the browser keeps under it there;
// a self-hosted server accepts up to 15 MB of file, about 20 MB of JSON.
app.post('/api/ai/parse-cv', aiLimiter, express.json({ limit: '21mb' }), async (req, res) => {
  try {
    const context = await authorize(req.headers.authorization, req.headers['x-demo-ai-key']);
    res.json({ data: await parseCv(context, req.body) });
  } catch (error) {
    sendError(res, error);
  }
});

app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'No such API route.' });
});

// Errors raised before a route runs, such as a body over the JSON limit or a body that is not JSON.
app.use(
  /** @type {(error: any, req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void} */
  (error, req, res, next) => {
    if (!req.path.startsWith('/api/') || res.headersSent) return next(error);
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: 'TOO_LARGE', message: 'This file is too large to send to the AI.' });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'The request could not be read.' });
      return;
    }
    sendError(res, error);
  },
);

/**
 * @param {import('express').Response} res
 * @param {unknown} error
 */
function sendError(res, error) {
  if (error instanceof ParseError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  console.error('[api]', error);
  res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong on the server.' });
}

export default app;
