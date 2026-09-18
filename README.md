# Alto el Lápiz

Juego de palabras multijugador en tiempo real (estilo _Stop_ / _Alto el Lápiz_) con
validación de respuestas por **IA local** (llama.cpp, también Ollama). El servidor es la única autoridad:
gestiona estado, puntuación, disputas y resolución, y emite el estado a todos los
clientes por WebSocket.

## Características

- Partidas multijugador (2–8 jugadores) por código de sala.
- Rondas con letra aleatoria, categorías configurables y límite de tiempo.
- Validación de respuestas con IA local (llama.cpp / Ollama) + umbral de confianza.
- Respuestas dudosas, disputas y resolución manual (con o sin IA disponible).
- Puntuación por única / repetida, recalculada de forma determinista.
- Reconexión, rate-limiting, cache y deduplicación (single-flight) de validaciones.
- Frontend React (Vite) con estado en vivo por WebSocket y reconexión automática.
- Tests del servidor con `node --test` (incluye un E2E por WebSocket) sin dependencias extra.

## Stack

| Capa     | Tecnología                                              |
| -------- | ------------------------------------------------------- |
| Compartido | TypeScript (`shared`) — tipos, límites y protocolo     |
| Servidor | Node (type stripping) + `ws` + `zod`, sin framework web |
| IA       | llama.cpp (API OpenAI-compatible) u Ollama + validador con cache/reintentos |
| Frontend | React 18 + Vite + CSS manual                            |
| Tests    | `node --test` (Node Test Runner)                        |

## Estructura

```
alto-lapiz/
├─ shared/    # Tipos, constantes, límites y protocolo (C2S/S2C)
├─ server/
│  ├─ src/
│  │  ├─ game/     # Motor puro (engine), servicio, puntuación, normalización
│  │  ├─ ai/       # Proveedores llama.cpp/Ollama, validador, prompt, schema, cache
│  │  ├─ ws/       # Hub WebSocket (routing, rate-limit, sanitización)
│  │  ├─ http/     # Servidor HTTP (health, estado IA, estáticos/SPA)
│  │  └─ util/     # id, ratelimit, pool, sanitize
│  └─ test/        # Tests de motor, servicio, IA y E2E por WebSocket
├─ web/
│  └─ src/         # App React: pantallas, hooks, cliente WS, estilos
├─ Dockerfile
├─ docker-compose.yml
└─ package.json     # workspaces: shared, server, web
```

## Requisitos

- **Node.js ≥ 23.6** (usa type stripping para ejecutar `.ts` directamente).
- **llama.cpp server** (opcional, para validación IA). También sirve Ollama.
  Sin IA el juego sigue funcionando: las respuestas se marcan como dudosas y
  se resuelven manualmente.

## Puesta en marcha (desarrollo)

```bash
# 1) Instalar dependencias de todos los workspaces
npm install

# 2) Terminal A — servidor (http://localhost:22019, WS en /ws)
npm run dev:server

# 3) Terminal B — frontend (http://localhost:5173, proxy a :22019)
npm run dev:web
```

Abre `http://localhost:5173` en varios dispositivos/pestañas, crea una partida y
comparte el código de sala.

> En Windows/PowerShell, si `npm.ps1` está bloqueado por política de ejecución,
> usa `npm.cmd install`, `npm.cmd run …`, etc.

## IA local (llama.cpp)

El proveedor por defecto es **llama.cpp server** (API compatible con OpenAI).
También se puede usar **Ollama** u otro endpoint compatible (`AI_PROVIDER`).

```bash
# 1) Compila llama.cpp con el servidor (o usa el binario precompilado)
#    https://github.com/ggml-org/llama.cpp
# 2) Descarga un modelo .gguf (p. ej. Llama-3.2-3B-Instruct Q4_K_M)
# 3) Arranca el servidor de inferencia
llama-server -m /ruta/a/Llama-3.2-3B-Instruct-Q4_K_M.gguf --port 9931 --ctx-size 4096
#    -> API en http://127.0.0.1:9931  (/v1/chat/completions, /v1/models)
```

El servidor del juego apunta a la IA por `AI_URL` (por defecto `http://127.0.0.1:9931`).
Comprueba la salud de la IA al arrancar y avisa en los logs si no está disponible.
Puedes cambiar proveedor/modelo/URL con variables de entorno (ver abajo).

> **Puertos por defecto:** juego en `22019`, llama.cpp en `9931`. Así no hay
> conflicto aunque los corras en la misma máquina.

## Tests

```bash
npm test                # ejecuta la suite del servidor (node --test)
npm run typecheck       # typecheck de server, web y shared
```

La suite incluye un **E2E por WebSocket** que levanta el servidor real (con un
proveedor IA falso) y juega una partida completa: crear → unirse → configurar →
rondas → respuestas → validación → puntuación → disputa → resolución → final.

## Build de producción

```bash
npm run build           # compila el frontend a web/dist
npm start               # arranca el servidor, que sirve web/dist + API + WS
```

El servidor sirve el frontend compilado desde `web/dist` (o `STATIC_DIR`) con
fallback SPA, y expone:

- `GET /api/health` — estado del servicio y disponibilidad de la IA.
- `GET /api/ai/status` — salud forzada del proveedor IA.
- `WS /ws` — canal de juego en tiempo real.

## Docker

```bash
# Opción 1 — juego + llama.cpp juntos (recomendado si no tienes llama.cpp)
#   Coloca un .gguf en ./models (ver MODEL_PATH en docker-compose.yml)
docker compose up --build -d

# Opción 2 — solo el juego, apuntando a un llama.cpp ya corriendo
AI_URL=http://<ip-llamacpp>:9931 docker compose up --build -d alto-lapiz

# O solo la imagen del juego (con un llama.cpp ya corriendo)
docker build -t alto-lapiz .
docker run --rm -p 22019:22019 \
  -e AI_PROVIDER=llamacpp \
  -e AI_URL=http://host.docker.internal:9931 \
  alto-lapiz
```

El `Dockerfile` es multi-stage: compila el frontend y arranca el servidor como
usuario no root, con `HEALTHCHECK` sobre `/api/health`. El `docker-compose.yml`
levanta el juego (host `22019`) y llama.cpp (host `9931`) en contenedores separados.

## Variables de configuración (servidor)

| Variable                  | Por defecto             | Descripción                                   |
| ------------------------- | ----------------------- | --------------------------------------------- |
| `PORT`                    | `22019`                 | Puerto HTTP/WS (alternativa: `8080`)          |
| `HOST`                    | `0.0.0.0`               | Interfaz de escucha                           |
| `AI_PROVIDER`             | `llamacpp`              | `llamacpp` (API OpenAI) u `ollama`            |
| `AI_URL`                  | `http://127.0.0.1:9931` | URL base del servidor de IA (sin ruta)        |
| `AI_MODEL`                | `llama3.2`              | Modelo a usar                                 |
| `AI_TEMPERATURE`          | `0.1`                   | Temperatura (0–2)                             |
| `AI_TIMEOUT_MS`           | `30000`                 | Timeout por llamada a la IA                   |
| `AI_CONCURRENCY`          | `2`                     | Validaciones en paralelo (1–16)               |
| `AI_CONFIDENCE_THRESHOLD` | `0.7`                   | Umbral de confianza (0–1)                     |
| `AI_MAX_RETRIES`          | `1`                     | Reintentos ante JSON inválido (0–3)           |
| `LOG_LEVEL`               | `info`                  | `debug` \| `info` \| `warn` \| `error`        |
| `ALLOWED_ORIGINS`         | _(vacío)_               | Orígenes WS permitidos (separados por coma)   |
| `STATIC_DIR`              | _(web/dist)_            | Carpeta del frontend compilado a servir       |

## Cómo se juega

1. **Crear o unirse** a una partida con el código de sala.
2. El **host** configura categorías, rondas y tiempo, y da el **start**.
3. Cada ronda muestra una **letra**; todos escriben una palabra por categoría.
4. Al terminar, alguien baja el **lápiz** (o llega el tiempo) y la **IA valida**.
5. En **resultados** se puntúa, se pueden **disputar** respuestas y el host
   **resuelve** o avanza a la siguiente ronda.
6. Al agotar las rondas, **puntuaciones finales** y opción de reiniciar.
