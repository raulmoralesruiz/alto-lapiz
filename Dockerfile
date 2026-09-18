# syntax=docker/dockerfile:1

# ---------- Stage 1: compila el frontend ----------
FROM node:24-slim AS build
WORKDIR /app
# Dependencias primero para aprovechar la caché de capas
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
# Código fuente, build del frontend y poda de dependencias de desarrollo
COPY . .
RUN npm run build -w web && npm prune --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:24-slim
ENV NODE_ENV=production \
    STATIC_DIR=/app/web/dist
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/web/dist ./web/dist
EXPOSE 22019
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:22019/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.ts"]
