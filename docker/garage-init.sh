#!/bin/bash
# Garage ローカルストレージ 初回セットアップ
# 使い方: bash docker/garage-init.sh

set -e

BUCKET=allergy-scan-images
KEY_NAME=localdev

echo "=== Garage セットアップ開始 ==="

# 1. ノード ID を取得してレイアウト登録
echo "[1/4] ノードレイアウトを設定..."
NODE_ID=$(docker compose exec -T garage garage node id 2>/dev/null | grep -oE '^[0-9a-f]+')
docker compose exec -T garage garage layout assign -z dc1 -c 1G "$NODE_ID"
docker compose exec -T garage garage layout apply --version 1
echo "ノードレイアウト完了: $NODE_ID"

# 2. アクセスキーを作成
echo "[2/4] アクセスキーを作成..."
KEY_OUTPUT=$(docker compose exec -T garage garage key create --name "$KEY_NAME")
KEY_ID=$(echo "$KEY_OUTPUT" | grep "Key ID" | awk '{print $NF}')
SECRET_KEY=$(echo "$KEY_OUTPUT" | grep "Secret key" | awk '{print $NF}')

# 3. バケットを作成
echo "[3/4] バケット '$BUCKET' を作成..."
docker compose exec -T garage garage bucket create "$BUCKET"

# 4. キーにバケットへのアクセス権を付与
echo "[4/4] アクセス権を付与..."
docker compose exec -T garage garage bucket allow --read --write "$BUCKET" --key "$KEY_ID"

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "以下を backend/.env に設定してください:"
echo "---"
echo "AWS_ENDPOINT_URL=http://localhost:3900"
echo "AWS_ACCESS_KEY_ID=$KEY_ID"
echo "AWS_SECRET_ACCESS_KEY=$SECRET_KEY"
echo "AWS_S3_BUCKET=$BUCKET"
echo "---"
