# ---- builder ステージ ----
FROM node:20-alpine AS builder

WORKDIR /app

# pnpm のインストール
RUN npm install -g pnpm

# monorepo ルートの workspace 設定・lock ファイルをコピー
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# frontend と backend の package.json をコピー（workspace 依存解決に両方必要）
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

# frontend の依存関係のみインストール
RUN pnpm install --frozen-lockfile --filter frontend

# frontend ソースコードをコピー
COPY frontend/ ./frontend/

# Next.js テレメトリを無効化
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter frontend build

# ---- runner ステージ ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 非 root ユーザーを作成
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone 出力と静的ファイルをコピー
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/frontend/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
