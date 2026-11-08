// Local and self-hosted server: the API from app.js plus the web app. On Vercel this file is not used;
// the web app is served as static files and the API runs from api/index.js.
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from './app.js';
import { supabaseEnv } from './env.js';

const isProduction = process.env.NODE_ENV === 'production';
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, '..', 'dist');

async function start() {
  if (isProduction) {
    const supabaseHost = supabaseEnv().url.replace(/\/$/, '');
    // Same rules as the Content-Security-Policy header in vercel.json.
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:', supabaseHost],
            fontSrc: ["'self'", 'data:'],
            // Realtime uses a websocket on the same host: https becomes wss, http becomes ws.
            connectSrc: ["'self'", supabaseHost, supabaseHost.replace(/^http/, 'ws'), 'blob:', 'data:'],
            workerSrc: ["'self'", 'blob:'],
            frameSrc: ["'self'", 'blob:', supabaseHost],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            upgradeInsecureRequests: null,
          },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'same-site' },
      }),
    );
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Onboarding Suite running on http://localhost:${port}`));
}

void start();
