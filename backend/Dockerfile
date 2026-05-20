# Lambda コンテナデプロイ用 Dockerfile
# ベースイメージ: AWS Lambda Node.js 20 ランタイム
FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

# pnpm のインストール
RUN npm install -g pnpm

# monorepo ルートの workspace 設定・lock ファイルをコピー
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# frontend と backend の package.json をコピー（workspace 依存解決に両方必要）
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

# backend の依存関係をインストール（devDependencies 含む: NestJS ビルドに必要）
RUN pnpm install --frozen-lockfile --filter backend

# backend ソースコードをコピー
COPY backend/ ./backend/

# NestJS ビルド（nest build → backend/dist/ に出力）
RUN pnpm --filter backend build

# 本番依存のみ再インストール（dist/ はそのまま保持）
RUN pnpm install --frozen-lockfile --prod --filter backend

# Lambda ハンドラー
# NOTE: src/lambda.ts が未実装のため、現時点は dist/main をエントリーとして指定。
#       Lambda デプロイ時は dist/lambda.handler に変更すること。
CMD ["dist/main"]
