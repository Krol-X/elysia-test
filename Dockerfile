# ===== STAGE 1: Builder =====
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Копируем манифесты сначала (кеш слоёв)
COPY package.json bun.lock ./

# Устанавливаем зависимости (только prod)
RUN bun install --production --frozen-lockfile

# Копируем исходники
COPY . .

# Собираем в бинарник (опционально, но ускоряет старт в проде)
RUN bun run build

# ===== STAGE 2: Production =====
FROM oven/bun:1-alpine AS production

# Метаданные
LABEL maintainer="you@example.com"
LABEL description="Stream Backend: Bun + Elysia + SQLite"

# Создаём non-root пользователя (безопасность)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S bun-user -u 1001

WORKDIR /app

# Копируем только скомпилированный бинарник + минимальные файлы
COPY --from=builder --chown=bun-user:nodejs /app/stream-api ./
COPY --from=builder --chown=bun-user:nodejs /app/config.example.yaml ./config.yaml

# Создаём папку для данных (SQLite, логи)
RUN mkdir -p /app/data /app/logs && \
    chown -R bun-user:nodejs /app

# Переключаемся на non-root
USER bun-user

# Переменные окружения по умолчанию
ENV NODE_ENV=production \
    DATABASE_URL=file:/app/app.db \
    PORT=3000 \
    LOG_LEVEL=info

# Health check (Docker будет пинговать эндпоинт)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Открываем порт
EXPOSE 3000

# Запуск (бинарник уже готов, не нужен bun runtime)
ENTRYPOINT ["./stream-api"]