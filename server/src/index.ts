import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.ts';
import { createLogger } from './log.ts';
import { OllamaProvider } from './ai/ollama.ts';
import { LlamaCppProvider } from './ai/llamacpp.ts';
import { AIValidator } from './ai/validator.ts';
import { Hub } from './ws/hub.ts';
import { createHttpServer } from './http/routes.ts';

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(`Configuración inválida: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const log = createLogger(config.logLevel);

const providerConfig = {
  url: config.aiUrl,
  model: config.aiModel,
  temperature: config.aiTemperature,
  timeoutMs: config.aiTimeoutMs,
};
const provider =
  config.aiProvider === 'ollama'
    ? new OllamaProvider(providerConfig)
    : new LlamaCppProvider(providerConfig);

const validator = new AIValidator(
  provider,
  {
    concurrency: config.aiConcurrency,
    maxRetries: config.aiMaxRetries,
    confidenceThreshold: config.aiConfidenceThreshold,
    log,
  },
);

const hub = new Hub({
  validator,
  log,
  allowedOrigins: config.allowedOrigins,
});

// En producción el frontend compilado vive en web/dist
const webDist = join(process.cwd(), '..', 'web', 'dist');
const staticDir = config.staticDir ?? (existsSync(webDist) ? webDist : null);

const server = createHttpServer({
  config,
  validator,
  log,
  gameCount: () => hub.gameCount,
  staticDir,
});

server.on('upgrade', (req, socket, head) => {
  hub.handleUpgrade(req, socket as never, head);
});

server.listen(config.port, config.host, () => {
  log.info('server.listening', {
    port: config.port,
    host: config.host,
    aiProvider: config.aiProvider,
    aiUrl: config.aiUrl,
    aiModel: config.aiModel,
    staticDir: staticDir ?? 'none',
  });
  void validator
    .checkHealth()
    .then((h) => {
      if (h.ok) log.info('ai.available', { model: config.aiModel, url: config.aiUrl });
      else log.warn('ai.unavailable', { detail: h.detail ?? 'desconocido', hint: 'Arranca Ollama y descarga el modelo: ollama pull ' + config.aiModel });
    })
    .catch((e) => log.warn('ai.health_check_failed', { error: e instanceof Error ? e.message : String(e) }));
});

function shutdown(signal: string): void {
  log.info('server.shutting_down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
