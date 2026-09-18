import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { AIValidator } from '../ai/validator.ts';
import type { Config } from '../config.ts';
import type { Logger } from '../log.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function serveStatic(res: ServerResponse, urlPath: string, staticDir: string): boolean {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  } catch {
    return false;
  }
  if (pathname === '/') pathname = '/index.html';
  const base = resolve(staticDir);
  const filePath = resolve(join(base, normalize(pathNameSafe(pathname))));
  if (filePath !== base && !filePath.startsWith(base + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback
    const index = join(base, 'index.html');
    if (existsSync(index)) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(readFileSyncSafe(index));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return true;
  }
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  res.end(readFileSyncSafe(filePath));
  return true;
}

function pathNameSafe(p: string): string {
  return p.replace(/^\/+/, '');
}

function readFileSyncSafe(p: string): Buffer {
  return readFileSync(p);
}

export function createHttpServer(opts: {
  config: Config;
  validator: AIValidator;
  log: Logger;
  gameCount: () => number;
  staticDir: string | null;
}): ReturnType<typeof createServer> {
  const { config, validator, log, gameCount, staticDir } = opts;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    if (req.method === 'GET' && url === '/api/health') {
      void (async () => {
        const health = await validator.checkHealth();
        sendJson(res, 200, {
          ok: true,
          service: 'alto-lapiz',
          games: gameCount(),
          ai: {
            available: health.ok,
            provider: validator.modelName,
            model: config.aiModel,
            url: config.aiUrl,
            error: health.ok ? null : health.detail ?? null,
          },
        });
      })();
      return;
    }
    if (req.method === 'GET' && url === '/api/ai/status') {
      void (async () => {
        const health = await validator.checkHealth(true);
        sendJson(res, 200, {
          available: health.ok,
          provider: validator.modelName,
          model: config.aiModel,
          url: config.aiUrl,
          error: health.ok ? null : health.detail ?? null,
        });
      })();
      return;
    }
    if (staticDir && existsSync(staticDir)) {
      if (serveStatic(res, url, staticDir)) return;
    }
    sendJson(res, 404, { error: 'No encontrado' });
  });
  server.on('request', (req) => {
    log.debug('http.request', { method: req.method, url: req.url });
  });
  return server;
}
