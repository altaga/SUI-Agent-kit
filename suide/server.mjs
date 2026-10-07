// Production server for the exported app: binds to loopback only (a reverse proxy terminates TLS in front).
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { createRequestHandler } = createRequire(import.meta.url)('expo-server/adapter/http');

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const handle = createRequestHandler({ build: path.join(dir, 'dist') });

http
  .createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    handle(req, res, (err) => {
      if (res.headersSent) return res.end();
      res.statusCode = err ? 500 : 404;
      res.end(err ? 'Internal error' : 'Not found');
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`SUIde on http://127.0.0.1:${port}`));
