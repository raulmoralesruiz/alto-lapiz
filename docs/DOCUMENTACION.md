# Documentación de la aplicación

**Alto el Lápiz** — juego de palabras multijugador en tiempo real, validado por IA local.

Repositorio: `C:\Users\raul\Documents\_dev\alto-lapiz`

## Índice

1. [Introducción](#1-introducción)
2. [Guía de usuario](#2-guía-de-usuario)
3. [Arquitectura técnica](#3-arquitectura-técnica)
4. [Documentación archivo por archivo](#4-documentación-archivo-por-archivo)
5. [Relación funcionalidades ↔ código](#5-relación-funcionalidades--código)
6. [Mapa de dependencias](#6-mapa-de-dependencias)
7. [Guía para desarrolladores](#7-guía-para-desarrolladores)
8. [Configuración](#8-configuración)
9. [Testing](#9-testing)
10. [Deploy y operación](#10-deploy-y-operación)
11. [Limitaciones y aspectos no determinados](#11-limitaciones-y-aspectos-no-determinados)
12. [Deuda técnica y puntos de atención](#12-deuda-técnica-y-puntos-de-atención)

---

## 1. Introducción

**Alto el Lápiz** es una versión digital del clásico juego de palabras: en cada ronda se revela una letra y cada jugador debe escribir una palabra por categoría que empiece por esa letra antes de que acabe el tiempo. Al terminar el tiempo, una IA local (llama.cpp u Ollama) valida cada respuesta; los jugadores pueden disputar validaciones y, en caso de disputa, cualquier jugador puede resolverla como válida o inválida.

Características principales (confirmadas en el código):

- Multijugador en tiempo real por WebSocket, con partidas identificadas por un código corto (5 caracteres).
- Validación de respuestas con IA local (llama.cpp por defecto, Ollama como alternativa), con caché, reintentos y concurrencia limitada.
- Puntuación configurable: puntos por respuesta única vs. repetida.
- Partidas con rondas configurables, tiempo por ronda configurable y categorías personalizadas.
- Interfaz web en español (React + Vite) servida por el propio servidor Node en producción.
- Despliegue empaquetado con Docker/Docker Compose, incluyendo un servicio llama.cpp opcional.

Stack confirmado:

| Capa | Tecnología |
|---|---|
| Compartido | TypeScript (`shared/src/types.ts`) |
| Servidor | Node.js (>=23.6), TypeScript, `ws`, `zod`, sin framework web |
| Cliente | React 18, Vite, CSS global manual |
| IA | llama.cpp (API compatible OpenAI) u Ollama |
| Tests | `node --test` |
| CI/Deploy | GitHub Actions, Docker, Docker Compose |

---

## 2. Guía de usuario

### 2.1 Requisitos

- Un navegador web moderno (usa WebSocket, `localStorage` y la API `clipboard` para copiar el código).
- Acceso a la URL del servidor (por defecto `http://<host>:22019`).
- Para la validación automática: un servicio de IA local accesible desde el servidor (llama.cpp en `http://127.0.0.1:9931` por defecto, u Ollama). Si no está disponible, la partida sigue funcionando pero las respuestas quedan sin validar automáticamente (ver 2.11).

### 2.2 Crear una partida

- **Objetivo:** iniciar una partida nueva y obtener un código para compartir.
- **Ubicación:** pantalla inicial (`web/src/screens/Home.tsx`), pestaña «Crear partida».
- **Pasos:**
  1. Escribe tu nombre (máximo 24 caracteres).
  2. Pulsa «Crear partida».
  3. En el lobby verás el código de la partida (5 caracteres, sin I, L, O, 0, 1) y un botón «Copiar».
- **Permisos:** quien crea la partida es el **anfitrión** y es el único que puede configurar y empezar.
- **Estados:** al crearse, la partida queda en fase `lobby`.

### 2.3 Unirse a una partida

- **Objetivo:** entrar a una partida existente.
- **Ubicación:** pantalla inicial, pestaña «Unirse».
- **Pasos:**
  1. Escribe tu nombre (máximo 24 caracteres).
  2. Escribe el código de la partida (4–8 caracteres alfanuméricos; el cliente lo convierte a mayúsculas y descarta caracteres no alfanuméricos).
  3. Pulsa «Unirse a la partida».
- **Casos límite:**
  - Código inexistente: error `not_found` («Partida no encontrada»).
  - Partida que ya no está en `lobby` (por ejemplo, ya empezó): error `not_lobby`.
  - Nombre vacío: el botón sigue deshabilitado.
  - Sin conexión al servidor: el botón sigue deshabilitado y se muestra «Conectando con el servidor…».

### 2.4 Lobby

- **Ubicación:** `web/src/screens/Lobby.tsx`.
- **Qué se ve:**
  - Código de la partida con botón «Copiar» (usa `navigator.clipboard`; si falla, no pasa nada visible).
  - Lista de jugadores con un punto de estado (conectado/desconectado), su nombre, «(tú)» para el propio jugador y la insignia «Anfitrión».
- **Acciones:**
  - Anfitrión: botón «Configurar y empezar» → pasa a la pantalla de configuración.
  - Resto: «Esperando a que el anfitrión configure la partida…».
  - Todos: «Salir de la partida».
- **Casos límite:** si el anfitrión se desconecta, el anfitrionado pasa al siguiente jugador conectado. Si todos se desconectan, la partida se elimina del servidor.

### 2.5 Configurar la partida

- **Ubicación:** `web/src/screens/Settings.tsx`. Solo el anfitrión accede (el servidor exige anfitrión para `open_config`, `update_settings`, `close_config` y `start`).
- **Opciones:**
  - **Idioma:** español, inglés, francés o catalán. Cambiar de idioma **reemplaza las categorías** por las categorías por defecto de ese idioma.
  - **Categorías:** mínimo 3, máximo 10, cada una de máximo 30 caracteres, sin duplicados (insensible a mayúsculas). Se añaden con el campo «Añadir categoría…» + botón «Añadir» y se eliminan con el botón «×».
  - **Rondas:** entre 1 y 10 (por defecto 3).
  - **Tiempo por ronda (segundos):** entre 15 y 300 (por defecto 60).
  - **Puntos (respuesta única):** 0–100 (por defecto 10).
  - **Puntos (respuesta repetida):** 0–100 (por defecto 5).
- **Acciones:**
  - «Empezar partida» → envía `update_settings` y `start`; la partida pasa a la primera ronda.
  - «Volver al lobby» → envía `close_config`.
  - «Salir» → abandona la partida.
- **Validación local:** si al empezar hay menos de 3 categorías se muestra el error «Se requieren al menos 3 categorías». El servidor también valida todos los rangos y devuelve errores como `bad_settings`.

### 2.6 Jugar una ronda

- **Ubicación:** `web/src/screens/Game.tsx`.
- **Flujo:**
  1. **Inicio de ronda** (fase `round_start`): se muestra la letra de la ronda durante unos segundos (revelado; por defecto 4 s, configurable con `ROUND_REVEAL_MS`).
  2. **Juego** (fase `playing`): cronómetro visible (compensado con la hora del servidor) y un campo de texto por categoría.
     - Lo que escribes se envía al servidor con un retardo de 350 ms (debounce) por categoría; la respuesta máxima es de 40 caracteres.
     - Puedes cambiar de opinión: el último texto enviado por categoría es el que cuenta.
     - Botón «¡Alto el lápiz!» (`pencil_down`): bloquea tus campos; a partir de ese momento tus respuestas no pueden modificarse, aunque el cronómetro siga corriendo para los demás.
  3. **Fin del tiempo:** el servidor pasa a `validating` y la IA valida las respuestas.
- **Notas:**
  - Si la IA no está disponible, las respuestas se marcan como `uncertain` (dudosas) y se puede seguir jugando (ver 2.11).
  - El cronómetro muestra `m:ss` y se pone en estado «urgente» con 10 segundos o menos.

### 2.7 Resultados de la ronda

- **Ubicación:** `web/src/screens/Results.tsx`.
- **Qué se ve:**
  - «Ronda X de N» y la letra de la ronda.
  - Por cada categoría con respuestas: cada respuesta con el texto, el autor, el motivo (si la IA o un jugador dio uno), su estado y los puntos otorgados.
  - Estados posibles: `Pendiente`, `Válida`, `Inválida`, `Dudosa`, `En disputa`.
- **Puntuación:**
  - Respuesta válida y única en la categoría: `pointsUnique` (por defecto 10).
  - Respuesta válida repetida (misma palabra normalizada de otro jugador, insensible a mayúsculas/espacios/acentos): `pointsShared` (por defecto 5).
  - Respuesta inválida, dudosa, en disputa o vacía: 0 puntos.
- **Acciones:**
  - **Disputar** (cualquier jugador, sobre respuestas válidas o inválidas): cambia el estado a `En disputa` y quita los puntos hasta resolverla.
  - **Resolver** (sobre respuestas en disputa): botones «Válida» / «Inválida». El servidor lo permite para cualquier jugador conectado; la interfaz muestra los botones a todos los jugadores.
  - **Siguiente ronda** / **Ver resultado final**: el botón lo muestra la interfaz solo al anfitrión; el servidor, en cambio, acepta `next_round` de cualquier jugador conectado (ver sección 12).
- **Casos límite:** si nadie respondió, se muestra «Nadie respondió esta ronda».

### 2.8 Fin de la partida

- **Ubicación:** `web/src/screens/Finished.tsx`.
- **Qué se ve:**
  - «¡Partida terminada!», el ganador (o «¡Empate entre …!» si hay varios con la máxima puntuación) y su puntuación.
  - Clasificación completa: posición, nombre, puntos.
- **Acciones:**
  - «Jugar otra vez» (visible para el anfitrión): reinicia la partida en el lobby manteniendo jugadores y configuración.
  - «Salir».

### 2.9 Mensajes de error frecuentes

| Mensaje | Código | Causa |
|---|---|---|
| «Partida no encontrada» | `not_found` | Código inexistente o partida eliminada. |
| «La partida no está en el lobby» | `not_lobby` | Intentar unirse a una partida que ya empezó. |
| «Nombre inválido» | `bad_name` | Nombre vacío o demasiado largo. |
| «Código inválido» | `bad_code` | Código de 1–3 caracteres o con caracteres no permitidos. |
| «Configuración inválida» | `bad_settings` | Valores fuera de rango o categorías inválidas. |
| «Solo el anfitrión puede hacer esto» | `not_host` | Acción reservada al anfitrión (configurar, empezar, etc.). |
| «No estás en la partida» | `not_player` | El jugador ya no pertenece a la partida. |
| «El tiempo ya terminó» | `round_over` | Enviar respuesta después del fin de la ronda. |
| «Respuesta demasiado larga» | `bad_answer` | Más de 40 caracteres. |
| «Mensaje inválido» | `bad_msg` | Mensaje malformado. |
| «Demasiados intentos de unirse, espera un momento» | `rate_limited` | Más de 20 uniones por minuto desde la misma IP. |
| «Demasiadas acciones, espera un momento» | `rate_limited` | Más de 150 acciones por minuto desde la misma IP. |

### 2.10 Reconexión y sesión

- La sesión (código, jugador, nombre) se guarda en `localStorage` bajo la clave `alto-lapiz:session`.
- Si la conexión se cae, el cliente reintenta automáticamente hasta 5 veces con espera exponencial (2 s, 4 s, 8 s, …, máximo 8 s). Al reconectar, recupera su identidad con el mensaje `hello`.
- Si al reconectar la partida ya no existe, el cliente vuelve a la pantalla inicial.
- El botón «Salir» cierra la sesión local y abandona la partida.

### 2.11 IA no disponible

- La cabecera muestra el estado de la IA: «IA: <modelo>» (disponible) o «IA no disponible».
- Si la IA no responde, la ronda sigue: las respuestas se marcan como `Dudosa` (0 puntos) y los jugadores pueden disputarlas y resolverlas manualmente.
- El estado de la IA se comprueba periódicamente (cada 15 s) y al arrancar el servidor.

### 2.12 Preguntas frecuentes (usuario)

- **¿Puedo cambiar mi respuesta después de «Alto el lápiz»?** No. El servidor descarta cambios posteriores a `pencil_down`.
- **¿Cuentan las respuestas vacías?** No: no puntúan ni se consideran duplicadas.
- **¿Dos jugadores con la misma palabra?** Si la palabra es válida, ambos puntúan con el valor de «respuesta repetida».
- **¿Quién decide si una palabra es válida?** Por defecto la IA. En disputa, cualquier jugador puede resolverla como válida o inválida.
- **¿Se puede jugar sin IA?** Sí, pero todas las respuestas quedarán como «Dudosa» y habrá que resolverlas manualmente.

---

## 3. Arquitectura técnica

### 3.1 Vista general

Monorepo npm con tres workspaces:

```
alto-lapiz/
├── shared/     # Tipos y constantes compartidas (sin dependencias)
├── server/     # Servidor Node: WebSocket + HTTP + IA + motor de juego
└── web/        # SPA React + Vite
```

- **`shared/src/types.ts`** es la única fuente de verdad del protocolo: fases, mensajes C2S/S2C, estados, límites y valores por defecto. Tanto `server` como `web` importan de ahí.
- **`server`** no usa framework web: `node:http` para HTTP/estáticos y `ws` para WebSocket. El motor de juego (`engine.ts`) muta un estado puro; `service.ts` añade efectos (temporizadores, IA, emisión); `hub.ts` gestiona sockets y enrutamiento de mensajes; `routes.ts` expone `/api/health`, `/api/ai/status` y el frontend estático.
- **`web`** es una SPA sin router: `App.tsx` cambia de pantalla según `game.phase`. El estado de la partida siempre viene del servidor (estado completo en cada `state`); el cliente no recalcula reglas.

### 3.2 Flujo de una partida

```
lobby → configuring → round_start → playing → validating → results → (next_round) → round_start → … → finished
```

- `createGame` (engine) crea la partida en `lobby` con el creador como anfitrión.
- `start` (solo anfitrión) pasa a `round_start` y arranca el temporizador de revelado.
- Al terminar el revelado (`PLAYING_START`) empieza el cronómetro de la ronda (`endsAt = now + reveal + timeLimit*1000`).
- Al llegar `endsAt` (`TIME_UP`) se pasa a `validating` y el servicio lanza la validación IA de todas las respuestas no vacías.
- Cada resultado de la IA actualiza el estado de la respuesta (progresivamente) y recalcula puntos; al terminar se emite `ai_done` (o `ai_unavailable`) y se pasa a `results`.
- `next_round` avanza o, si era la última, pasa a `finished`. `restart` vuelve a `lobby`.

### 3.3 Validación IA

Capas (`server/src/ai/`):

1. **`provider.ts`** — interfaz `AIProvider` (`validate`, `check`, `name`).
2. **`llamacpp.ts` / `ollama.ts`** — implementaciones HTTP.
3. **`prompt.ts`** — construye el prompt de validación (con protección contra prompt injection) y el mensaje de reintento.
4. **`schema.ts`** — schema Zod del resultado y `parseAIResponse` tolerante a markdown/texto extra.
5. **`cache.ts`** — caché FIFO (máx. 2000 entradas) por `idioma|letra|categoría|respuesta-normalizada`.
6. **`validator.ts`** — fachada `AIValidator`: concurrencia limitada (`mapPool`), reintentos, umbral de confianza, single-flight por clave, verificación de salud con TTL de 15 s y `validateMany` con resultados progresivos.

Decisión de validación:

- `valid === true` y `confidence >= umbral` → `valid`.
- `valid === false` → `invalid`.
- `valid === true` pero confianza por debajo del umbral → `uncertain`.
- Error tras los reintentos → `uncertain` (y, si el proveedor está caído, evento `ai_unavailable`).

### 3.4 Estado y concurrencia

- Una partida es un objeto `GameState` mutable gestionado por un `GameService` (uno por partida, en el `Hub`).
- Los eventos de red se procesan por socket; los temporizadores (`later`) se programan con `setTimeout` inyectable (los tests usan timers falsos).
- La validación IA es asíncrona y progresiva: cada respuesta se resuelve por separado y el estado se emite al resolverse.

### 3.5 Seguridad (lo que sí hace el código)

- Sanitización de nombres, categorías y respuestas (`sanitizeText`, `normalizeAnswer`).
- Validación de mensajes con `zod` en el hub.
- Rate limiting por IP: 20 uniones/min y 150 acciones/min.
- Validación de `Origin` en el upgrade WebSocket si `ALLOWED_ORIGINS` está configurado.
- Servidor estático con protección contra path traversal (403) y SPA fallback.
- El prompt de la IA instruye explícitamente ignorar instrucciones dentro de las respuestas.
- **No** hay autenticación, cifrado de aplicación ni persistencia: la partida vive en memoria del proceso.

---

## 4. Documentación archivo por archivo

### 4.1 Raíz del repositorio

#### `package.json`
- **Propósito:** definir el monorepo y los scripts globales.
- **Responsabilidades:** workspaces `shared`, `server`, `web`; scripts `dev:server`, `dev:web`, `build`, `start`, `test`, `typecheck`; `engines.node >= 23.6`.
- **Elementos principales:**
  - `dev:server` → `npm run dev -w server`
  - `dev:web` → `npm run dev -w web`
  - `build` → `npm run build -w web`
  - `start` → `npm run start -w server`
  - `test` → `npm run test -w server`
  - `typecheck` → `tsc` en `shared`, `server` y `web`

#### `tsconfig.base.json`
- **Propósito:** configuración TypeScript común.
- **Elementos principales:** `target ES2022`, `module NodeNext`, `moduleResolution NodeNext`, `strict`, `noUncheckedIndexedAccess`, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `skipLibCheck`.

#### `.gitignore`
- Ignora `node_modules/`, `dist/`, logs, `.env`, `.env.local`, `.DS_Store`, `coverage/`, `models/`, `*.gguf`, `tmp/`.

#### `.dockerignore`
- Excluye del contexto Docker: `node_modules`, `dist`, logs, `.env*`, `.git`, `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `README.md`, entre otros.

#### `.env.example`
- **Propósito:** plantilla de variables de entorno del servidor.
- **Contenido confirmado:** `PORT`, `HOST`, `AI_PROVIDER`, `AI_URL`, `AI_MODEL`, `AI_TEMPERATURE`, `AI_TIMEOUT_MS`, `AI_CONCURRENCY`, `AI_CONFIDENCE_THRESHOLD`, `AI_MAX_RETRIES`, `LOG_LEVEL`, `ALLOWED_ORIGINS` (opcional).

#### `Dockerfile`
- **Propósito:** imagen de producción multi-stage.
- **Responsabilidades:**
  - Stage 1 (`node:24-slim`): `npm ci`, `npm run build -w web`, `npm prune --omit=dev`.
  - Stage 2 (`node:24-slim`): copia `package*.json`, workspaces y `web/dist`; `NODE_ENV=production`, `STATIC_DIR=/app/web/dist`; `EXPOSE 22019`; `USER node`; `HEALTHCHECK` contra `http://127.0.0.1:22019/api/health`; `CMD ["node", "server/src/index.ts"]`.
- **Errores/casos límite:** si el build del frontend falla, el build de la imagen falla.
- **Puntos de extensión:** añadir capas de dependencias o cambiar la base de Node.

#### `docker-compose.yml`
- **Propósito:** orquestar el juego + un servidor llama.cpp.
- **Servicio `alto-lapiz`:** build del repo, puerto `22019:22019`, env por defecto (`AI_PROVIDER=llamacpp`, `AI_URL=http://llamacpp:9931`, `AI_MODEL=llama3.2`, `AI_TEMPERATURE=0.1`, `AI_TIMEOUT_MS=30000`, `AI_CONCURRENCY=2`, `AI_CONFIDENCE_THRESHOLD=0.7`, `AI_MAX_RETRIES=1`, `LOG_LEVEL=info`), todas sobreescritibles.
- **Servicio `llamacpp`:** imagen `ghcr.io/ggml-org/llama.cpp:server`, puerto `9931:9931`, volumen `./models:/models`, modelo `${MODEL_PATH:-/models/llama-3.2-3b-instruct-q4_k_m.gguf}`, `--ctx-size 4096`.
- **Casos límite:** si no hay modelo en `./models`, el servicio llama.cpp arranca sin modelo y la IA queda «no disponible».

#### `pnpm-lock.yaml`
- Lockfile pnpm con `lockfileVersion: '9.0'` y `importers` vacío. El proyecto se instala con npm (`package-lock.json`); el papel de este archivo en el flujo actual es **No determinado a partir del código analizado**.

#### `README.md`
- Documentación breve del proyecto: descripción, características, stack, estructura, desarrollo, scripts y deploy.

#### `models/llama-3.2-3b-instruct-q4_k_m.gguf`
- Modelo GGUF (~2 GB) que consume el servicio `llamacpp` de `docker-compose.yml` (volumen `./models:/models`).

#### `web/dist/nginx/nginx.conf`
- Artefacto dentro del build del frontend: configuración nginx (puerto 80, `root /usr/share/nginx/html`, fallback SPA `try_files … /index.html`, caché de assets 1 año `immutable`). No la usa el servidor Node; parece destinada a un despliegue alternativo con nginx.

### 4.2 `shared/`

#### `shared/package.json`
- **Propósito:** paquete `@alto-lapiz/shared`.
- **Elementos principales:** `exports: { ".": "./src/types.ts" }`; sin dependencias.

#### `shared/src/types.ts`
- **Propósito:** contrato compartido entre servidor y cliente.
- **Responsabilidades:** todos los tipos de dominio, el protocolo WebSocket y los límites/defaults.
- **Elementos principales:**
  - `Language = 'es' | 'en' | 'fr' | 'ca'`; `LANGUAGES`; `LANGUAGE_NAMES`.
  - `DEFAULT_CATEGORIES: Record<Language, string[]>` (p. ej. es: `['Ciudad', 'Animal', 'Alimento', 'Profesión', 'Cosa']`).
  - `GameSettings { categories, rounds, timeLimit, language, pointsUnique, pointsShared }`.
  - `DEFAULT_SETTINGS` (rounds 3, timeLimit 60, language 'es', pointsUnique 10, pointsShared 5).
  - `Phase = 'lobby' | 'configuring' | 'round_start' | 'playing' | 'validating' | 'results' | 'finished'`.
  - `AnswerStatus = 'pending' | 'valid' | 'invalid' | 'uncertain' | 'disputed'`; `DecidedBy = 'ai' | 'player' | 'system'`.
  - `PlayerState`, `AnswerState`, `RoundState`, `AiStatus`, `GameState`.
  - `C2SMessage`: `hello`, `create`, `join`, `open_config`, `close_config`, `update_settings`, `start`, `answer`, `pencil_down`, `dispute`, `resolve`, `next_round`, `restart`, `leave`.
  - `S2CMessage`: `joined`, `state`, `event`, `ai_status`, `error`.
  - `GameEventKind`: `pencil_down`, `round_started`, `round_ended`, `ai_validating`, `ai_done`, `ai_unavailable`.
  - Límites: `MAX_NAME_LEN=24`, `MAX_ANSWER_LEN=40`, `MAX_CATEGORY_LEN=30`, `MAX_CATEGORIES=10`, `MIN_CATEGORIES=3`, `MAX_ROUNDS=10`, `MAX_TIME_LIMIT=300`, `MIN_TIME_LIMIT=15`.
- **Dependencias:** ninguna.
- **Dependencias inversas:** `server/src/**`, `web/src/**`.
- **Errores/casos límite:** es solo tipos y constantes; no ejecuta lógica.
- **Ejemplo de modificación:** añadir un idioma nuevo = añadirlo a `Language`, `LANGUAGES`, `LANGUAGE_NAMES` y `DEFAULT_CATEGORIES`.

### 4.3 `server/`

#### `server/package.json`
- **Propósito:** paquete `@alto-lapiz/server`.
- **Elementos principales:** `type: module`; scripts `dev` (`node --watch src/index.ts`), `start` (`node src/index.ts`), `test` (`node --test test/*.test.ts`), `typecheck` (`tsc -p tsconfig.json`); dependencias `@alto-lapiz/shared`, `ws`, `zod`.

#### `server/src/index.ts`
- **Propósito:** punto de entrada del servidor.
- **Responsabilidades:**
  1. `loadConfig()`; si falla, imprime el error y `process.exit(1)`.
  2. Crea el logger (`createLogger(config.logLevel)`).
  3. Elige proveedor IA según `AI_PROVIDER` (`OllamaProvider` o `LlamaCppProvider`) con `{url, model, temperature, timeoutMs}`.
  4. Crea `AIValidator` con `{concurrency, maxRetries, confidenceThreshold, log}`.
  5. Crea `Hub` con `{validator, log, allowedOrigins}`.
  6. Resuelve `staticDir`: `STATIC_DIR` o, si existe, `../web/dist` relativo al cwd.
  7. Crea el servidor HTTP (`createHttpServer`) y enlaza `server.on('upgrade')` a `hub.handleUpgrade`.
  8. `listen(port, host)`; al arrancar, comprueba la salud de la IA y loguea el resultado (o un hint de `ollama pull`).
  9. Manejo de `SIGINT`/`SIGTERM`: cierra el servidor y fuerza salida a los 3 s.
- **Dependencias:** `config.ts`, `log.ts`, `ai/*`, `ws/hub.ts`, `http/routes.ts`.
- **Errores/casos límite:** configuración inválida → salida inmediata con mensaje; IA caída al arranque → solo warning, el servidor sigue.
- **Puntos de extensión:** añadir middlewares HTTP, otros proveedores, métricas.

#### `server/src/config.ts`
- **Propósito:** leer y validar la configuración por variables de entorno.
- **Elementos principales:** `loadConfig()` y `Config`.
- **Configuración (variable, default, validación):**
  | Variable | Default | Validación |
  |---|---|---|
  | `PORT` | `22019` | entero 1–65535 |
  | `HOST` | `0.0.0.0` | — |
  | `AI_PROVIDER` | `llamacpp` | `ollama` o `llamacpp` |
  | `AI_URL` | `http://127.0.0.1:9931` | sin barra final |
  | `AI_MODEL` | `llama3.2` | — |
  | `AI_TEMPERATURE` | `0.1` | 0–2 |
  | `AI_TIMEOUT_MS` | `30000` | >= 1000 |
  | `AI_CONCURRENCY` | `2` | 1–16 |
  | `AI_CONFIDENCE_THRESHOLD` | `0.7` | 0–1 |
  | `AI_MAX_RETRIES` | `1` | 0–3 |
  | `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
  | `ALLOWED_ORIGINS` | (no configurada) | lista CSV → array; `null` si vacía |
  | `STATIC_DIR` | (no configurada) | string o `null` |
- **Errores:** lanza `Error` con mensaje descriptivo si algún valor es inválido.
- **Puntos de extensión:** añadir variables nuevas (p. ej. límites de partida) y exponerlas en `Config`.

#### `server/src/log.ts`
- **Propósito:** logger mínimo con niveles.
- **Elementos principales:** `LogLevel`, `Logger`, `createLogger(minLevel)`.
- **Formato:** `[ISO timestamp] LEVEL mensaje key=value …` por `console`.
- **Casos límite:** los mensajes por debajo del nivel mínimo se descartan.

#### `server/src/ws/hub.ts`
- **Propósito:** gestionar sockets WebSocket, clientes, partidas y enrutamiento de mensajes.
- **Responsabilidades:**
  - `WebSocketServer({ noServer: true })`; `handleUpgrade` valida el `Origin` contra `allowedOrigins` (si está configurado) y acepta la conexión.
  - `ClientCtx { ws, playerId, gameCode, name, remoteAddress }`.
  - Registro de partidas en `Map<string, GameService>`; `gameCount` expuesto para `/api/health`.
  - `hello` → reconectar a una partida existente (`CODE_RE = /^[A-Z0-9]{4,8}$/`).
  - `create` → valida nombre/configuración, crea partida, anfitrión = creador.
  - `join` → solo en `lobby`; rate limit `joinLimiter` (20/60 s por IP).
  - Resto de acciones: `actionLimiter` (150/60 s por IP).
  - Schemas `zod` para `settings` y mensajes; `sanitizeText` para nombre/categorías/respuestas.
  - `onGameEmpty` elimina la partida del mapa cuando no quedan jugadores.
  - Emite `state` completo a todos los jugadores tras cada cambio; `ai_status` cuando cambia la salud de la IA.
- **Dependencias:** `ws`, `zod`, `game/service.ts`, `game/engine.ts`, `util/*`, `shared`.
- **Errores/casos límite:** mensajes inválidos → `error` con código; desconexión → marca jugador desconectado y, si era anfitrión, traspasa el anfitrionado; partida vacía → eliminación.
- **Ejemplo de modificación:** para añadir un mensaje C2S nuevo, añadirlo a `C2SMessage` (shared), validarlo aquí y tratarlo en `GameService.handleClientEvent`.

#### `server/src/http/routes.ts`
- **Propósito:** servidor HTTP: health, estado IA y frontend estático.
- **Endpoints:**
  - `GET /api/health` → `{ ok: true, service: 'alto-lapiz', games, ai: { available, provider, model, url, error } }` (usa `validator.checkHealth()`).
  - `GET /api/ai/status` → `{ available, provider, model, url, error }` (usa `validator.checkHealth(true)`, fuerza refresh).
  - Cualquier otra ruta → si hay `staticDir`, sirve el archivo o hace SPA fallback a `index.html`; si no, `404 { error: 'No encontrado' }`.
- **Elementos principales:** `MIME` (html, js, mjs, css, json, svg, png, ico, woff2, map), `sendJson` (`cache-control: no-store`), `serveStatic` (decode de la URL, bloqueo de path traversal con 403, fallback SPA).
- **Errores/casos límite:** URL malformada → 404; ruta fuera de `staticDir` → 403; archivo inexistente → `index.html` (SPA) o 404.
- **Puntos de extensión:** nuevos endpoints API, compresión, CORS.

#### `server/src/game/engine.ts`
- **Propósito:** motor de juego puro (sin I/O): estado y transiciones.
- **Responsabilidades:**
  - `createGame(host, settings)` → partida en `lobby` con `aiStatus { available: null, model: null, error: null }`.
  - `EngineError` con `code` y `message`.
  - `getRevealMs()`: `ROUND_REVEAL_MS` (número finito >= 0) o 4000 ms.
  - `handleEvent` / `apply` con la unión `GameEvent`: `JOIN`, `LEAVE`, `DISCONNECT`, `RECONNECT`, `OPEN_CONFIG`, `CLOSE_CONFIG`, `UPDATE_SETTINGS`, `START`, `PLAYING_START`, `SET_ANSWER`, `PENCIL_DOWN`, `TIME_UP`, `SET_ANSWER_STATUS`, `SCORE_ROUND`, `DISPUTE`, `RESOLVE`, `NEXT_ROUND`, `RESTART`, `SET_AI_STATUS`.
  - `startRound`: elige letra (evitando repetir la anterior), crea `RoundState`, `endsAt = now + reveal + timeLimit*1000`.
  - `recomputeRoundPoints` usando `computeRoundPoints`.
  - Reglas de permisos: `requireHost` para `OPEN_CONFIG`, `CLOSE_CONFIG`, `UPDATE_SETTINGS`, `START`; `requirePlayer` para el resto de acciones de juego.
  - Traspaso de anfitrionado al desconectar el host; eliminación de jugador si abandona.
- **Dependencias:** `shared`, `letters.ts`, `normalize.ts`, `scoring.ts`, `util/id.ts`.
- **Errores/casos límite:** `EngineError` con códigos (`not_found`, `not_lobby`, `bad_name`, `bad_code`, `bad_settings`, `not_host`, `not_player`, `round_over`, `bad_answer`).
- **Ejemplo de modificación:** cambiar la regla de puntos = editar `scoring.ts`; cambiar fases = editar `Phase` (shared) + `engine.ts` + `App.tsx`.

#### `server/src/game/service.ts`
- **Propósito:** capa de efectos sobre el motor: temporizadores, IA y emisión de eventos.
- **Responsabilidades:**
  - `ServiceDeps { validator, log, broadcast, sendTo, onGameEmpty, setTimer?, clearTimer? }`.
  - `GameService`: envuelve un `GameState` y expone `handleClientEvent`, `destroy`, `later`, `clearTimers`.
  - Temporizadores: fin del revelado → `PLAYING_START`; fin de la ronda → `TIME_UP`.
  - Validación: al llegar `TIME_UP`, `validator.validateMany` sobre las respuestas no vacías; cada resultado aplica `SET_ANSWER_STATUS` (progresivo) y recalcula puntos; al terminar emite `ai_done` o `ai_unavailable` y pasa a `results`.
  - `DISPUTE`/`RESOLVE` reabren el estado de la respuesta y recalculan puntos.
- **Dependencias:** `engine.ts`, `ai/validator.ts`, `shared`.
- **Errores/casos límite:** IA caída → respuestas `uncertain` + `ai_unavailable`; temporizadores se limpian en `destroy`.
- **Puntos de extensión:** notificaciones push, estadísticas, auditoría.

#### `server/src/game/letters.ts`
- **Propósito:** elegir la letra de la ronda.
- **Elementos principales:** `randomLetter(exclude?)` sobre `A–Z` con `crypto.randomInt`, evitando opcionalmente la letra anterior.

#### `server/src/game/normalize.ts`
- **Propósito:** normalización de respuestas.
- **Elementos principales:**
  - `normalizeAnswer(raw)`: elimina caracteres de control, colapsa espacios, recorta y minúsculas.
  - `duplicateKey(normalized)`: además insensible a acentos (NFD); «París» y «paris» son el mismo intento.

#### `server/src/game/scoring.ts`
- **Propósito:** calcular puntos de una ronda (función pura).
- **Elementos principales:** `computeRoundPoints(answers, settings) → Map<answerId, puntos>`.
- **Reglas:** válida y única → `pointsUnique`; válida y repetida (por `duplicateKey` dentro de la misma categoría) → `pointsShared`; inválida/dudosa/en disputa/vacía → 0.

#### `server/src/ai/provider.ts`
- **Propósito:** interfaz de proveedor IA.
- **Elementos principales:**
  - `AIValidationRequest { letter, category, answer, language }`.
  - `AIOutcome { valid, confidence, reason, normalizedAnswer }`.
  - `ValidateContext { attempt, previousBad? }`.
  - `ProviderHealth { ok, detail? }`.
  - `AIProvider { name, validate(req, context?), check() }`.

#### `server/src/ai/llamacpp.ts`
- **Propósito:** proveedor para servidores llama.cpp (API compatible OpenAI).
- **Responsabilidades:**
  - `validate`: construye el prompt; si hay `context.previousBad`, añade el intento fallido como mensaje `assistant` y el `RETRY_MESSAGE` como `user`; llama a `postChat` y parsea con `parseAIResponse`.
  - `postChat`: `POST {url}/v1/chat/completions` con `model`, `temperature`, `max_tokens: 300`, `response_format: { type: 'json_object' }`, timeout con `AbortSignal.timeout`.
  - `check()`: `GET {url}/v1/models` (timeout 3 s); falla si no hay modelos o si, habiendo varios, `AI_MODEL` no coincide con ninguno de los ids.
- **Errores/casos límite:** red caída, timeout, modelo inexistente, respuesta no JSON.

#### `server/src/ai/ollama.ts`
- **Propósito:** proveedor para Ollama.
- **Responsabilidades:**
  - `validate`: mismo patrón que llama.cpp (prompt + reintento con `previousBad` + `parseAIResponse`).
  - `postChat`: `POST {url}/api/chat` con `stream: false`, `format: 'json'`, `options: { temperature, num_predict: 300 }`.
  - `check()`: `GET {url}/api/tags` (timeout 3 s); busca el modelo exacto o con prefijo `modelo:`; falla si no está descargado.
- **Errores/casos límite:** red caída, timeout, modelo no descargado.

#### `server/src/ai/prompt.ts`
- **Propósito:** construir el prompt de validación.
- **Elementos principales:**
  - `buildValidationPrompt(req)`: instrucciones de árbitro, `DATOS DE LA RONDA` (letra, categoría, respuesta, idioma), advertencia de que la respuesta es contenido no confiable (anti prompt-injection) y exigencia de JSON exclusivo con el schema.
  - `RETRY_MESSAGE`: pide de nuevo únicamente el objeto JSON del schema.

#### `server/src/ai/schema.ts`
- **Propósito:** validación del resultado de la IA.
- **Elementos principales:**
  - `AI_RESULT_SCHEMA`: `valid: boolean`, `confidence: number` (0–1), `reason: string` (1–300), `normalized_answer: string` (1–80).
  - `parseAIResponse(text)`: tolera bloques markdown y texto alrededor del JSON; lanza `AIFormatError` si no extrae un resultado válido.

#### `server/src/ai/cache.ts`
- **Propósito:** caché de validaciones.
- **Elementos principales:**
  - `cacheKey(language, letter, category, normalized)` → `idioma|LETRA|categoría-minúsculas|normalizada`.
  - `ValidationCache`: FIFO con `max` (default 2000), `get`/`set`.

#### `server/src/ai/validator.ts`
- **Propósito:** fachada de validación con políticas transversales.
- **Responsabilidades:**
  - `AIValidator(provider, { concurrency, maxRetries, confidenceThreshold, log })`.
  - `validateMany(requests, onResult)`: single-flight por clave (`inFlight`), concurrencia vía `mapPool`, resultados progresivos.
  - `validateOne`: reintentos ante errores; si el fallo es `AIFormatError`, reintenta con `previousBad` (el JSON malo) en el contexto.
  - Umbral de confianza: `valid` con confianza insuficiente → `uncertain`.
  - `checkHealth(force?)`: TTL de 15 s (`HEALTH_TTL_MS`) para no martillear al proveedor; `modelName` expuesto para las rutas HTTP.
- **Dependencias:** `provider.ts`, `prompt.ts`, `schema.ts`, `cache.ts`, `util/pool.ts`.
- **Errores/casos límite:** proveedor caído → `uncertain` + detalle; timeout por petición.

#### `server/src/util/id.ts`
- **Propósito:** identificadores.
- **Elementos principales:** `newId()` (`randomUUID`); `newGameCode(length = 5)` con alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sin I, L, O, 0, 1) y `crypto.randomBytes`.

#### `server/src/util/pool.ts`
- **Propósito:** concurrencia limitada.
- **Elementos principales:** `mapPool(items, limit, fn, onResult?)` — workers que consumen índices; `onResult` se llama al resolverse cada elemento (actualizaciones progresivas).

#### `server/src/util/ratelimit.ts`
- **Propósito:** limitación de tasa en memoria.
- **Elementos principales:** `RateLimiter(limit, windowMs)` con ventana deslizante por clave (IP).

#### `server/src/util/sanitize.ts`
- **Propósito:** limpiar texto de usuario.
- **Elementos principales:** `sanitizeText(input, maxLen)` — elimina control/zero-width/bidi, colapsa espacios, recorta a `maxLen`.

---

### 4.4 `web/`

#### `web/package.json`
- **Propósito:** paquete `@alto-lapiz/web`.
- **Elementos principales:** scripts `dev` (`vite`), `build` (`tsc -p tsconfig.json && vite build`), `preview` (`vite preview`), `typecheck`; dependencias React 18, `react-dom`, `@alto-lapiz/shared`; devDependencies Vite y plugin react.

#### `web/index.html`
- **Propósito:** documento base.
- **Elementos principales:** `lang="es"`, `<div id="root">`, carga de `/src/main.tsx`.

#### `web/vite.config.ts`
- **Propósito:** configuración de Vite.
- **Elementos principales:** puerto de desarrollo `5173`; proxy `/ws` (con `ws: true`) y `/api` hacia `http://localhost:${PORT ?? 22019}`; `build.outDir = 'dist'`.

#### `web/src/main.tsx`
- **Propósito:** bootstrap de React.
- **Responsabilidades:** renderiza `<App />` en `#root` dentro de `<StrictMode>`; lanza error si falta `#root`; importa `./styles.css`.

#### `web/src/App.tsx`
- **Propósito:** enrutamiento por fase.
- **Responsabilidades:**
  - Sin `game`/`playerId` → `Home`.
  - Con partida → `Header` + pantalla según `game.phase`: `lobby` → `Lobby`; `configuring` → `Settings`; `round_start`/`playing`/`validating` → `Game`; `results` → `Results`; `finished` → `Finished`; default → «Fase desconocida».
  - Banner de error global (cierre con «×») visible durante la partida.
- **Dependencias:** `useGame.ts`, todas las pantallas, `Header.tsx`.

#### `web/src/ws.ts`
- **Propósito:** cliente WebSocket fino.
- **Elementos principales:**
  - `wsUrl()`: `ws://` o `wss://` según `window.location.protocol`, en `/ws`.
  - `GameSocket`: `connect` (idempotente), `send` (solo si OPEN), `close` (marca `closedByUser` para no disparar `onClose`), `isOpen`.
  - `SocketHandlers`: `onJoined`, `onState`, `onEvent`, `onAiStatus`, `onError`, `onOpen`, `onClose`.
  - `dispatch` por `msg.t`.
- **Casos límite:** JSON inválido del servidor se descarta silenciosamente.

#### `web/src/useGame.ts`
- **Propósito:** hook de estado de la partida + sesión + reconexión.
- **Responsabilidades:**
  - Estado: `game`, `playerId`, `connected`, `error`, `aiStatus`, `skewMs` (derivado de `serverNow - Date.now()`).
  - Sesión en `localStorage` (`alto-lapiz:session`): `code`, `playerId`, `name`; se guarda en `onJoined` y se limpia en `resetToHome`.
  - Al abrir el socket, reenvía `hello` si hay sesión (reconexión transparente).
  - Reconexión: hasta `MAX_RECONNECT = 5` intentos con backoff `min(1000 * 2^attempts, 8000)` ms.
  - `onError` con `not_found`/`bad_msg` durante el `hello` → `resetToHome`.
  - API: `create(name, settings?)`, `join(code, name)` (convierte código a mayúsculas), `send`, `leave`, `clearError`.
- **Dependencias:** `ws.ts`, `types.ts`, React.

#### `web/src/useCountdown.ts`
- **Propósito:** cuenta atrás compensada con el reloj del servidor.
- **Elementos principales:** `useCountdown(endsAt, skewMs, active)` — tick cada 200 ms, `serverNow = now + skewMs`, devuelve segundos restantes (mín. 0); `formatSeconds` → `m:ss`.

#### `web/src/types.ts`
- **Propósito:** reexportar tipos y constantes de `@alto-lapiz/shared` para el resto del frontend.

#### `web/src/components/Header.tsx`
- **Propósito:** cabecera persistente.
- **Elementos principales:** marca «Alto el Lápiz»; insignias: código de partida (`#XXXXX`), estado IA (`IA: <modelo>` / `IA no disponible` / `IA: desconocido`, con `title` de detalle), conexión (`En línea` / `Sin conexión`); botón «Salir» si hay `onLeave`.

#### `web/src/screens/Home.tsx`
- **Propósito:** crear o unirse.
- **Responsabilidades:** tabs «Crear partida» / «Unirse»; nombre (máx. `MAX_NAME_LEN`); en «Unirse», código (máx. 8, solo `[A-Z0-9]`); botones deshabilitados si no hay conexión o faltan datos; banner de error con cierre.
- **Casos límite:** sin conexión → «Conectando con el servidor…».

#### `web/src/screens/Lobby.tsx`
- **Propósito:** lobby de la partida.
- **Responsabilidades:** código con «Copiar» (`navigator.clipboard`, errores ignorados); lista de jugadores ordenada (anfitrión primero) con punto de conexión, «(tú)» e insignia «Anfitrión»; anfitrión ve «Configurar y empezar» (`open_config`); el resto, mensaje de espera; «Salir de la partida».

#### `web/src/screens/Settings.tsx`
- **Propósito:** configuración de la partida (anfitrión).
- **Responsabilidades:**
  - Idioma: al cambiarlo, las categorías se sustituyen por `DEFAULT_CATEGORIES[lang]`.
  - Categorías: añadir (máx. 30 caracteres, máx. 10, sin duplicados insensible a mayúsculas) y eliminar (mín. 3).
  - Rondas (1–`MAX_ROUNDS`), tiempo (`MIN_TIME_LIMIT`–`MAX_TIME_LIMIT`), puntos únicos y repetidos (0–100) con `clampInt`.
  - «Empezar partida» → `update_settings` + `start`; «Volver al lobby» → `close_config`; «Salir».
  - Errores locales con banner.

#### `web/src/screens/Game.tsx`
- **Propósito:** pantalla de juego (revelado, validación y juego).
- **Responsabilidades:**
  - `round_start` → `RoundStart` (letra grande).
  - `validating` → `Validating` (spinner + «La IA está validando las respuestas…»).
  - `playing` → `Playing`:
    - Cronómetro `useCountdown(round.endsAt, skewMs, true)`; clase `urgent` con <= 10 s.
    - Campo por categoría; debounce de 350 ms por categoría (`pendingRef`); `maxLength = MAX_ANSWER_LEN`; el valor mostrado es el local o el confirmado por el servidor.
    - «¡Alto el lápiz!» → `pencil_down` y deshabilita los campos.
    - «Salir».
- **Casos límite:** sin `round` → «Cargando ronda…»; fase inesperada → «Esperando…».

#### `web/src/screens/Results.tsx`
- **Propósito:** resultados de la ronda.
- **Responsabilidades:**
  - Cabecera «Ronda X de N» + letra; botón del anfitrión «Siguiente ronda» / «Ver resultado final» (`next_round`).
  - Agrupación por categoría (solo las con respuestas); por respuesta: texto (o «—»), autor, motivo, estado (`STATUS_LABEL`: Pendiente/Válida/Inválida/Dudosa/En disputa), puntos.
  - Botones: «Disputar» (si no está `disputed`/`pending`); «Válida»/«Inválida» (si está `disputed`) → `resolve`.
  - «Salir».

#### `web/src/screens/Finished.tsx`
- **Propósito:** fin de partida.
- **Responsabilidades:** ganador o empate (mismo score máximo); clasificación ordenada por puntos (empates por nombre); «Jugar otra vez» (anfitrión, `restart`); «Salir».

#### `web/src/styles.css`
- **Propósito:** hoja de estilos global de la SPA.
- **Elementos principales:** design tokens en `:root` (colores, radio, sombra, tipografía system-ui); layout `.app` (max-width 760 px, centrado); estilos de header, tarjetas, tabs, campos, badges de estado, pantallas de juego, resultados y clasificación; 290 líneas.
- **Casos límite:** CSS plano, sin preprocesador ni CSS modules.

#### `web/src/vite-env.d.ts`
- **Propósito:** referencia de tipos de Vite (`/// <reference types="vite/client" />`).

### 4.5 Tests

#### `server/test/helpers.ts`
- **Propósito:** utilidades de test.
- **Elementos principales:** `silentLogger`; `reqKey(req)` = `categoría|respuesta-minúscula`; `FakeProvider` configurable (`ok`, `responses` por clave, `failFirstN`, contadores `calls`/`healthCalls`) que implementa `AIProvider`.

#### `server/test/e2e.test.ts`
- **Propósito:** prueba end-to-end con HTTP + WebSocket reales.
- **Elementos principales:** clase `Client` (open, send, lastState, waitFor); levanta el servidor con `ROUND_REVEAL_MS=50` y `LOG_LEVEL=error`; cubre crear, unirse, configurar, empezar, responder, validar (con `FakeProvider`), resultados y fin.

#### `server/test/engine.test.ts`
- **Propósito:** tests del motor puro.
- **Casos cubiertos (confirmados):** creación de partida en lobby con anfitrión; código de partida de 5 caracteres de `[A-Z2-9]`; `JOIN` solo en lobby; flujo completo de una ronda (start → playing → time up → validating → results).

#### `server/test/service.test.ts`
- **Propósito:** tests del servicio de partida.
- **Elementos principales:** `FakeProvider` + timers falsos (`createFakeTimers`); verifica emisión de `broadcast`/`sendTo`, validación IA, disputas y resolución.

#### `server/test/validator.test.ts`
- **Propósito:** tests de `AIValidator`.
- **Casos cubiertos (confirmados):** validación correcta/incorrecta; la caché evita llamadas duplicadas; concurrencia; reintentos con `previousBad`; umbral de confianza → `uncertain`.

#### `server/test/scoring.test.ts`
- **Propósito:** tests de puntuación.
- **Casos cubiertos (confirmados):** puntos únicos vs. compartidos; duplicados por mayúsculas y acentos; inválidas con 0.

#### `server/test/normalize.test.ts`
- **Propósito:** tests de `normalizeAnswer` y `duplicateKey`.

#### `server/test/llamacpp.test.ts`
- **Propósito:** tests de `LlamaCppProvider` con un servidor HTTP mock.
- **Casos cubiertos (confirmados):** `check()` con modelos (único, varios, inexistente); `validate` con respuesta válida y con fallo.

#### `server/test/ai-schema.test.ts`
- **Propósito:** tests de `parseAIResponse`.
- **Casos cubiertos (confirmados):** JSON válido; JSON dentro de markdown; JSON con texto alrededor; rechaza claves faltantes, confianza fuera de rango, no-JSON y cadena vacía.

#### `server/test/ai-prompt.test.ts`
- **Propósito:** tests de `buildValidationPrompt`.
- **Casos cubiertos (confirmados):** incluye letra, categoría, respuesta e idioma; exige JSON exclusivo; advierte contra prompt injection; `RETRY_MESSAGE` menciona el JSON.

---

## 5. Relación funcionalidades ↔ código

| Funcionalidad (usuario) | Código principal |
|---|---|
| Crear partida | `web/src/screens/Home.tsx` → `useGame.create` → `hub.ts` (`create`) → `engine.ts` (`createGame`) |
| Unirse con código | `Home.tsx` → `useGame.join` → `hub.ts` (`join`, `joinLimiter`) → `engine.ts` (`JOIN`) |
| Lobby y copia del código | `web/src/screens/Lobby.tsx` |
| Configurar partida | `web/src/screens/Settings.tsx` → `update_settings`/`start` → `engine.ts` (`UPDATE_SETTINGS`, `START`, `requireHost`) |
| Revelado de la letra | `engine.ts` (`startRound`, `getRevealMs`) → `service.ts` (timer `PLAYING_START`) → `Game.tsx` (`RoundStart`) |
| Escribir respuestas | `Game.tsx` (`Playing`, debounce 350 ms) → `hub.ts` → `engine.ts` (`SET_ANSWER`) |
| «Alto el lápiz» | `Game.tsx` (`stop`) → `engine.ts` (`PENCIL_DOWN`) |
| Cronómetro | `useCountdown.ts` + `skewMs` de `useGame.ts` + `round.endsAt` del servidor |
| Validación IA | `service.ts` (`TIME_UP`) → `validator.ts` → `llamacpp.ts`/`ollama.ts` → `prompt.ts`/`schema.ts`/`cache.ts` → `engine.ts` (`SET_ANSWER_STATUS`) |
| Puntuación | `scoring.ts` (`computeRoundPoints`) + `normalize.ts` (`duplicateKey`) |
| Resultados y disputas | `Results.tsx` → `engine.ts` (`DISPUTE`, `RESOLVE`) → `recomputeRoundPoints` |
| Siguiente ronda / fin | `Results.tsx` / `Finished.tsx` → `engine.ts` (`NEXT_ROUND`, `RESTART`) |
| Estado de la IA (UI) | `routes.ts` (`/api/ai/status`) + `hub.ts` (`ai_status`) + `Header.tsx` |
| Health del servicio | `routes.ts` (`/api/health`) + `validator.checkHealth` |
| Reconexión | `useGame.ts` (backoff, `hello`) + `hub.ts` (`hello`/`RECONNECT`) |
| Rate limiting | `util/ratelimit.ts` + `hub.ts` (`joinLimiter`, `actionLimiter`) |

---

## 6. Mapa de dependencias

### 6.1 Entre paquetes

```
web  ──► @alto-lapiz/shared
server ──► @alto-lapiz/shared
shared ──► (nada)
```

### 6.2 Dentro de `server/src`

```
index.ts
├── config.ts
├── log.ts
├── ai/validator.ts
│   ├── ai/provider.ts (interfaz)
│   ├── ai/llamacpp.ts ─┐
│   ├── ai/ollama.ts   ─┤──► ai/prompt.ts, ai/schema.ts
│   ├── ai/cache.ts     │
│   └── util/pool.ts    │
├── ws/hub.ts
│   ├── game/service.ts
│   │   ├── game/engine.ts
│   │   │   ├── game/letters.ts
│   │   │   ├── game/normalize.ts
│   │   │   ├── game/scoring.ts
│   │   │   └── util/id.ts
│   │   └── ai/validator.ts
│   └── util/{id,ratelimit,sanitize}.ts
└── http/routes.ts
    ├── ai/validator.ts
    └── config.ts
```

### 6.3 Dentro de `web/src`

```
main.tsx ──► App.tsx ──► useGame.ts ──► ws.ts ──► types.ts ──► @alto-lapiz/shared
                  ├── components/Header.tsx
                  ├── screens/Home.tsx
                  ├── screens/Lobby.tsx
                  ├── screens/Settings.tsx
                  ├── screens/Game.tsx ──► useCountdown.ts
                  ├── screens/Results.tsx
                  └── screens/Finished.tsx
```

### 6.4 Dependencias externas (producción)

| Paquete | Dependencias |
|---|---|
| `shared` | — |
| `server` | `ws`, `zod`, `@alto-lapiz/shared` |
| `web` | `react`, `react-dom`, `@alto-lapiz/shared` |

Dev (web): `vite`, `@vitejs/plugin-react`, `typescript`.

---

## 7. Guía para desarrolladores

### 7.1 Requisitos

- Node.js **>= 23.6** (el servidor ejecuta TypeScript directamente con Node; el CI usa Node 24).
- npm (el repositorio se instala con `npm ci` / `npm install`; hay un `pnpm-lock.yaml` cuyo papel exacto es **No determinado a partir del código analizado**).
- Opcional: un servidor llama.cpp u Ollama corriendo para la validación IA.

### 7.2 Instalación y desarrollo

```bash
npm install            # instala los 3 workspaces
npm run dev:server     # servidor con --watch en http://localhost:22019
npm run dev:web        # Vite en http://localhost:5173 (proxy /ws y /api al 22019)
```

- En desarrollo, el frontend se sirve por Vite (puerto 5173) y hace proxy de `/ws` y `/api` al servidor (22019).
- En producción, el servidor Node sirve `web/dist` (o `STATIC_DIR`) y el mismo puerto sirve SPA + API + WebSocket.

### 7.3 Scripts

| Comando | Efecto |
|---|---|
| `npm run dev:server` | `npm run dev -w server` → `node --watch src/index.ts` |
| `npm run dev:web` | `npm run dev -w web` → `vite` |
| `npm run build` | `npm run build -w web` → `tsc -p tsconfig.json && vite build` |
| `npm start` | `npm run start -w server` → `node src/index.ts` |
| `npm test` | `npm run test -w server` → `node --test test/*.test.ts` |
| `npm run typecheck` | `tsc` en `shared`, `server` y `web` |

### 7.4 Convenciones observadas en el código

- **Tipado estricto:** `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`; ESM (`type: module`, `NodeNext`).
- **Capas:** `engine.ts` es puro (sin I/O, sin timers); `service.ts` añade efectos; `hub.ts` gestiona sockets; `routes.ts` HTTP. Mantener esa separación al modificar.
- **Protocolo compartido:** cualquier cambio de mensajes, fases o límites debe hacerse primero en `shared/src/types.ts` y propagarse a `hub.ts`, `engine.ts`/`service.ts` y a las pantallas de `web`.
- **Validación en el borde:** `zod` en `hub.ts`, `sanitizeText`/`normalizeAnswer` para texto de usuario; no confiar en el cliente.
- **Errores:** `EngineError` con `code` estables que viajan al cliente en `{ t: 'error', code, message }`; el cliente los muestra como están.
- **Tests:** `node --test` con `FakeProvider` y timers falsos; los tests de red levantan el servidor real con `ROUND_REVEAL_MS=50`.

### 7.5 Ejemplos de modificación

- **Añadir un mensaje C2S nuevo:**
  1. Añadirlo a `C2SMessage` en `shared/src/types.ts`.
  2. Validarlo y enrutarlo en `server/src/ws/hub.ts`.
  3. Añadir el evento correspondiente en `server/src/game/engine.ts` (y `service.ts` si tiene efectos).
  4. Emitir la acción desde la pantalla relevante en `web/src/screens/*`.
  5. Añadir tests en `server/test/engine.test.ts` / `service.test.ts` / `e2e.test.ts`.
- **Añadir un proveedor IA nuevo:** implementar `AIProvider` (`validate`, `check`, `name`) en `server/src/ai/`, registrarla en `server/src/index.ts` según `AI_PROVIDER`, y añadir su variable en `config.ts` si hace falta.
- **Cambiar reglas de puntuación:** editar `server/src/game/scoring.ts` y sus tests (`server/test/scoring.test.ts`).
- **Añadir un idioma:** ampliar `Language`, `LANGUAGES`, `LANGUAGE_NAMES`, `DEFAULT_CATEGORIES` en `shared/src/types.ts`.

### 7.6 Verificación antes de entregar

```bash
npm run typecheck   # shared + server + web
npm test            # tests del servidor (incluye e2e)
npm run build       # build de la SPA
```

El CI (`.github/workflows/ci.yml`) ejecuta exactamente: `npm ci` → `npm run typecheck` → `npm test` → `npm run build` con Node 24.

---

## 8. Configuración

### 8.1 Variables de entorno del servidor (`server/src/config.ts`)

| Variable | Default | Descripción | Validación |
|---|---|---|---|
| `PORT` | `22019` | Puerto HTTP/WS | entero 1–65535 |
| `HOST` | `0.0.0.0` | Interfaz de escucha | — |
| `AI_PROVIDER` | `llamacpp` | Proveedor IA | `ollama` o `llamacpp` |
| `AI_URL` | `http://127.0.0.1:9931` | Base URL del proveedor | sin barra final |
| `AI_MODEL` | `llama3.2` | Id del modelo | — |
| `AI_TEMPERATURE` | `0.1` | Temperatura del LLM | 0–2 |
| `AI_TIMEOUT_MS` | `30000` | Timeout por petición IA | >= 1000 |
| `AI_CONCURRENCY` | `2` | Peticiones IA en paralelo | 1–16 |
| `AI_CONFIDENCE_THRESHOLD` | `0.7` | Confianza mínima para `valid` | 0–1 |
| `AI_MAX_RETRIES` | `1` | Reintentos ante fallo | 0–3 |
| `LOG_LEVEL` | `info` | Nivel de log | `debug`, `info`, `warn`, `error` |
| `ALLOWED_ORIGINS` | (no set) | Orígenes WS permitidos (CSV) | `null` si vacía |
| `STATIC_DIR` | (no set) | Directorio de estáticos | si no existe, fallback a `../web/dist` o 404 |
| `ROUND_REVEAL_MS` | `4000` | Duración del revelado de la letra | número finito >= 0 (usado por `engine.getRevealMs`) |

Notas:

- `ROUND_REVEAL_MS` no aparece en `.env.example`; se lee directamente en `engine.ts`.
- `ALLOWED_ORIGINS` solo se aplica en el upgrade WebSocket; si no se define, se aceptan todos los orígenes.
- El valor de `AI_URL` en `docker-compose.yml` es `http://llamacpp:9931` (nombre del servicio), sobreescritable.

### 8.2 Configuración de partida (por partida, en el cliente)

| Campo | Rango | Default |
|---|---|---|
| `categories` | 3–10, cada una 1–30 caracteres, sin duplicados | `DEFAULT_CATEGORIES[language]` |
| `language` | `es`, `en`, `fr`, `ca` | `es` |
| `rounds` | 1–10 | 3 |
| `timeLimit` (s) | 15–300 | 60 |
| `pointsUnique` | 0–100 | 10 |
| `pointsShared` | 0–100 | 5 |

### 8.3 Límites fijos del protocolo (`shared/src/types.ts`)

| Constante | Valor |
|---|---|
| `MAX_NAME_LEN` | 24 |
| `MAX_ANSWER_LEN` | 40 |
| `MAX_CATEGORY_LEN` | 30 |
| `MAX_CATEGORIES` | 10 |
| `MIN_CATEGORIES` | 3 |
| `MAX_ROUNDS` | 10 |
| `MAX_TIME_LIMIT` | 300 |
| `MIN_TIME_LIMIT` | 15 |

### 8.4 Otros parámetros internos

| Parámetro | Valor | Dónde |
|---|---|---|
| Rate limit uniones | 20 / 60 s por IP | `hub.ts` (`joinLimiter`) |
| Rate limit acciones | 150 / 60 s por IP | `hub.ts` (`actionLimiter`) |
| Caché IA | FIFO 2000 entradas | `cache.ts` |
| TTL salud IA | 15 s | `validator.ts` (`HEALTH_TTL_MS`) |
| `max_tokens` llama.cpp | 300 | `llamacpp.ts` |
| `num_predict` Ollama | 300 | `ollama.ts` |
| Timeout health IA | 3 s | `llamacpp.ts` / `ollama.ts` |
| Backoff reconexión cliente | 2 s, 4 s, … máx. 8 s; 5 intentos | `useGame.ts` |
| Debounce de respuesta | 350 ms por categoría | `Game.tsx` |
| Código de partida | 5 chars de `ABCDEFGHJKMNPQRSTUVWXYZ23456789` | `util/id.ts` |

---

## 9. Testing

### 9.1 Marco

- Runner: `node --test` (Node >= 23.6, CI con Node 24).
- Comandos:
  - `npm test` (raíz) → `npm run test -w server`
  - `npm run test -w server` → `node --test test/*.test.ts`
  - `npm run typecheck` → `tsc` en `shared`, `server`, `web`
- No hay tests en `web` ni en `shared` (solo en `server/test`).

### 9.2 Suite de tests (`server/test/`)

| Archivo | Qué cubre |
|---|---|
| `helpers.ts` | `silentLogger`, `reqKey`, `FakeProvider` (proveedor IA en memoria configurable con fallos) |
| `e2e.test.ts` | End-to-end real: servidor HTTP + WebSocket; crear/unirse/configurar/empezar/responder/validar/resultados; usa `ROUND_REVEAL_MS=50` |
| `engine.test.ts` | Motor puro: creación, `JOIN` solo en lobby, código de 5 chars `[A-Z2-9]`, flujo completo de ronda |
| `service.test.ts` | Servicio: timers falsos, emisión de eventos, validación IA, disputas/resolución |
| `validator.test.ts` | `AIValidator`: caché, concurrencia, reintentos con `previousBad`, umbral de confianza |
| `scoring.test.ts` | Puntuación: únicas vs. repetidas, duplicados por mayúsculas/acentos, 0 para inválidas |
| `normalize.test.ts` | `normalizeAnswer`, `duplicateKey` |
| `llamacpp.test.ts` | `LlamaCppProvider` con HTTP mock: `check()` (1 modelo, varios, inexistente) y `validate` |
| `ai-schema.test.ts` | `parseAIResponse`: JSON puro, markdown, texto alrededor, rechazos |
| `ai-prompt.test.ts` | `buildValidationPrompt`: incluye datos de la ronda, exige JSON, anti prompt-injection; `RETRY_MESSAGE` |

### 9.3 Cómo se prueban las piezas

- **Motor y servicio:** sin red; `FakeProvider` + timers falsos (`createFakeTimers`) para avanzar el tiempo de forma determinística.
- **IA (providers):** servidor HTTP local mock dentro del test; se comprueban payloads, headers y parsing.
- **E2E:** levanta el servidor real en un puerto efímero y habla por WebSocket; valida el estado completo (`state`) y los eventos (`event`).

### 9.4 Ejecución

```bash
npm test                 # todo lo de server/test
npm run typecheck        # tipos de los 3 workspaces
```

Ejemplos de invocar un solo archivo (desde `server/`):

```bash
node --test test/engine.test.ts
node --test test/e2e.test.ts
```

---

## 10. Deploy y operación

### 10.1 Build de producción

```bash
npm run build     # genera web/dist
npm start         # node server/src/index.ts (sirve web/dist)
```

- `STATIC_DIR` puede apuntar a otro directorio de estáticos; si no, el servidor usa `../web/dist` (relativo al cwd) si existe.

### 10.2 Docker

```bash
docker compose up --build -d
```

- `alto-lapiz`: el juego (puerto 22019), con `HEALTHCHECK` a `/api/health`.
- `llamacpp`: servidor llama.cpp (puerto 9931) con el modelo de `./models` (por defecto `llama-3.2-3b-instruct-q4_k_m.gguf`).
- Variables sobreescritas en `docker-compose.yml`: `AI_PROVIDER`, `AI_URL`, `AI_MODEL`, `AI_TEMPERATURE`, `AI_TIMEOUT_MS`, `AI_CONCURRENCY`, `AI_CONFIDENCE_THRESHOLD`, `AI_MAX_RETRIES`, `LOG_LEVEL`.
- Si no hay modelo en `./models`, el juego funciona pero la IA queda «no disponible» (respuestas `uncertain`).

### 10.3 CI (GitHub Actions)

`.github/workflows/ci.yml` con Node 24:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

### 10.4 Operación habitual

- **Health:** `GET /api/health` → `{ ok, service, games, ai: { available, provider, model, url, error } }`.
- **Estado IA:** `GET /api/ai/status` (fuerza recheck) → `{ available, provider, model, url, error }`.
- **Logs:** por `console`, nivel con `LOG_LEVEL`; formato `[ISO] LEVEL msg key=value`.
- **Shutdown:** `SIGINT`/`SIGTERM` cierran el servidor; salida forzada a los 3 s.
- **Limitaciones operativas:** estado en memoria (un reinicio pierde todas las partidas); rate limiting y caché en memoria por proceso; sin autenticación ni cifrado de aplicación (pensado para red local/privada o detrás de TLS).

---

## 11. Limitaciones y aspectos no determinados

### 11.1 Limitaciones conocidas (derivadas del código)

- **Sin persistencia:** partidas, jugadores y resultados viven en memoria del proceso; un reinicio los elimina.
- **Sin autenticación:** cualquiera que llegue al puerto puede crear/unirse a partidas; el anfitrión es quien crea la partida.
- **Rate limiting en memoria:** no es distribuido; con varias instancias no se comparte el contador.
- **IA local obligatoria para validar:** sin llama.cpp/Ollama accesible, todas las respuestas quedan `uncertain` y hay que resolverlas a mano.
- **Modelo pequeño:** un LLM pequeño (3B) puede validar incorrectamente casos dudosos; el umbral de confianza y las disputas mitigan, no eliminan, el error.
- **Un anfitrión por partida:** si el anfitrión se desconecta, el rol pasa al siguiente jugador conectado; si todos salen, la partida se elimina.
- **Código de partida corto (5 chars):** colisiones teóricas posibles; el servidor no reserva códigos de forma global más allá de `newGameCode` aleatorio.
- **Frontend sin tests:** la capa `web` no tiene suite de tests; la cobertura de UI depende del e2e del servidor.
- **`styles.css` analizado parcialmente:** se confirmaron design tokens y layout general (290 líneas); el detalle completo de cada regla es **No determinado a partir del código analizado**.

### 11.2 Aspectos no determinados

- Papel exacto de `pnpm-lock.yaml` en el flujo de instalación actual (el repo usa `npm`): **No determinado a partir del código analizado**.
- Uso previsto de `web/dist/nginx/nginx.conf` (despliegue alternativo con nginx): **No determinado a partir del código analizado**.
- Detalle completo de `web/src/styles.css` más allá de lo leído: **No determinado a partir del código analizado**.
- Cualquier comportamiento de los proveedores IA no cubierto por los tests (p. ej. variaciones de respuesta entre modelos): **No determinado a partir del código analizado**.

---

## 12. Deuda técnica y puntos de atención

> Solo se listan puntos observables en el código actual, sin proponer refactorizaciones por estilo.

1. **Permisos de `next_round`/`restart`:** el servidor los acepta de cualquier jugador conectado (`requirePlayer`), pero la interfaz solo los muestra al anfitrión. Un cliente malicioso podría forzar el avance/reinicio de la partida.
2. **`resolve` sin restricción de rol:** cualquier jugador puede resolver una disputa; no hay registro de quién resolvió más allá del evento.
3. **`ALLOWED_ORIGINS` opcional:** por defecto no se valida el origen de los WebSockets; en exposiciones públicas conviene fijarlo.
4. **Rate limiting por IP en memoria:** no cubre NAT/proxies mal configurados ni escalado multi-instancia.
5. **Caché IA sin invalidación:** si cambia el modelo o el prompt, la caché (2000 entradas) sigue sirviendo resultados antiguos.
6. **`ROUND_REVEAL_MS` fuera de `config.ts`:** se lee directamente en `engine.ts`; no aparece en `.env.example` ni en la tabla de configuración central.
7. **`pnpm-lock.yaml` huérfano:** coexiste con `package-lock.json`/npm; su mantenimiento es ambiguo.
8. **`web/dist/nginx/nginx.conf` dentro del build:** artefacto sin consumidor claro en el flujo actual.
9. **Sin tests en `web`:** la lógica de UI (debounce, reconexión, pantallas) no está cubierta por tests propios.
10. **Prompt de la IA en español fijo:** `buildValidationPrompt` redacta las instrucciones en español aunque la partida pueda ser en otro idioma; la respuesta se valida contra la categoría en el idioma de la partida.
11. **Estado de la IA con TTL de 15 s:** si el proveedor se cae, hasta 15 s las validaciones pueden seguir intentando contra él (con timeout de 30 s por defecto).
12. **Códigos de partida no reservados:** `newGameCode` es aleatorio; no hay verificación de colisión contra partidas existentes en el `Hub`.

---

*Documento generado a partir del código del repositorio. Los detalles marcados como «No determinado a partir del código analizado» no están confirmados en el código revisado.*
