// Production server for the exported app. Binds to loopback only; a reverse proxy terminates TLS in front.
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createRequestHandler } = require('expo-server/adapter/http');
const send = require('send');

const dir = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(dir, 'dist', 'client');
const handle = createRequestHandler({ build: path.join(dir, 'dist', 'server') });
const port = Number(process.env.PORT || 3000);

const fail = (res, code, msg) => { if (!res.headersSent) { res.statusCode = code; res.setHeader('content-type', 'text/plain'); } res.end(msg); };

http
  .createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const app = () => handle(req, res, (err) => fail(res, err ? 500 : 404, err ? 'Internal error' : 'Not found'));
    if (req.method !== 'GET' && req.method !== 'HEAD') return app();
    const pathname = new URL(req.url || '/', 'http://x').pathname;
    const stream = send(req, pathname, { root: staticDir, extensions: ['html'], dotfiles: 'ignore' });
    let served = false;
    stream.on('file', () => { served = true; });
    stream.on('error', (err) => (served || !(err.statusCode < 500) ? fail(res, err.statusCode || 500, 'Error') : app()));
    stream.pipe(res);
  })
  .listen(port, '127.0.0.1', () => console.log(`SUIde on http://127.0.0.1:${port}`));
