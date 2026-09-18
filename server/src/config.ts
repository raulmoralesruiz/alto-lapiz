export interface Config {
  port: number;
  host: string;
  aiProvider: 'ollama' | 'llamacpp';
  aiUrl: string;
  aiModel: string;
  aiTemperature: number;
  aiTimeoutMs: number;
  aiConcurrency: number;
  aiConfidenceThreshold: number;
  aiMaxRetries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  allowedOrigins: string[] | null;
  staticDir: string | null;
}

function intFromEnv(env: NodeJS.ProcessEnv, key: string, def: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`La variable de entorno ${key} debe ser un número (recibido: "${raw}")`);
  return Math.trunc(n);
}

function numFromEnv(env: NodeJS.ProcessEnv, key: string, def: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`La variable de entorno ${key} debe ser un número (recibido: "${raw}")`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const logLevel = (env.LOG_LEVEL ?? 'info') as Config['logLevel'];
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`LOG_LEVEL inválido: ${logLevel} (usa debug, info, warn o error)`);
  }
  const staticDir = env.STATIC_DIR ?? (process.platform === 'win32' ? undefined : undefined);
  const config: Config = {
    // Puerto del juego: 22019 (alternativa: 8080)
    port: intFromEnv(env, 'PORT', 22019),
    host: env.HOST ?? '0.0.0.0',
    aiProvider: (env.AI_PROVIDER ?? 'llamacpp') as Config['aiProvider'],
    // llama.cpp por defecto en 9931 (alternativa: 8080)
    aiUrl: (env.AI_URL ?? 'http://127.0.0.1:9931').replace(/\/+$/, ''),
    aiModel: env.AI_MODEL ?? 'llama3.2',
    aiTemperature: numFromEnv(env, 'AI_TEMPERATURE', 0.1),
    aiTimeoutMs: intFromEnv(env, 'AI_TIMEOUT_MS', 30000),
    aiConcurrency: intFromEnv(env, 'AI_CONCURRENCY', 2),
    aiConfidenceThreshold: numFromEnv(env, 'AI_CONFIDENCE_THRESHOLD', 0.7),
    aiMaxRetries: intFromEnv(env, 'AI_MAX_RETRIES', 1),
    logLevel,
    allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : null,
    staticDir: staticDir ?? null,
  };
  if (!['ollama', 'llamacpp'].includes(config.aiProvider)) throw new Error(`AI_PROVIDER inválido: ${config.aiProvider} (usa ollama o llamacpp)`);
  if (config.aiTemperature < 0 || config.aiTemperature > 2) throw new Error('AI_TEMPERATURE debe estar entre 0 y 2');
  if (config.aiTimeoutMs < 1000) throw new Error('AI_TIMEOUT_MS debe ser >= 1000');
  if (config.aiConcurrency < 1 || config.aiConcurrency > 16) throw new Error('AI_CONCURRENCY debe estar entre 1 y 16');
  if (config.aiConfidenceThreshold < 0 || config.aiConfidenceThreshold > 1) throw new Error('AI_CONFIDENCE_THRESHOLD debe estar entre 0 y 1');
  if (config.aiMaxRetries < 0 || config.aiMaxRetries > 3) throw new Error('AI_MAX_RETRIES debe estar entre 0 y 3');
  return config;
}
