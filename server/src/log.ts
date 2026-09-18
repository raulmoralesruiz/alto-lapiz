export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const WEIGHTS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    const rendered = typeof v === 'string' ? v : JSON.stringify(v);
    parts.push(`${k}=${rendered}`);
  }
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

export function createLogger(minLevel: LogLevel = 'info'): Logger {
  const threshold = WEIGHTS[minLevel];
  const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>): void => {
    if (WEIGHTS[level] < threshold) return;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${msg}${formatMeta(meta)}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
  return {
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
  };
}
