#!/bin/bash
# Garage ローカルストレージ 初回セットアップ
# 使い方: bash docker/garage-init.sh

export MSYS_NO_PATHCONV=1

BUCKET=allergy-scan-images
KEY_NAME=localdev
GARAGE="docker compose exec -T garage /garage"

echo "=== Garage セットアップ開始 ==="

# 1. ノードレイアウト設定（未適用の場合のみ）
echo "[1/4] ノードレイアウトを確認..."
NODE_ID=$($GARAGE node id 2>/dev/null | tail -1)
echo "  ノードID: $NODE_ID"

LAYOUT_STATUS=$($GARAGE layout show 2>/dev/null | grep "Number of partitions" || true)
if [ -z "$LAYOUT_STATUS" ]; then
  $GARAGE layout assign -z dc1 -c 1G "$NODE_ID"
  $GARAGE layout apply --version 1
  echo "  レイアウト設定完了"
else
  echo "  レイアウト設定済みのためスキップ"
fi

# 2. アクセスキーを作成（既存なら一度削除して再作成）
echo "[2/4] アクセスキーを作成..."
EXISTING=$($GARAGE key list 2>/dev/null | grep "$KEY_NAME" || true)
if [ -n "$EXISTING" ]; then
  echo "  既存キー '$KEY_NAME' を削除して再作成..."
  $GARAGE key delete --yes "$KEY_NAME" 2>/dev/null || true
fi
KEY_OUTPUT=$($GARAGE key create "$KEY_NAME" 2>&1)
KEY_ID=$(echo "$KEY_OUTPUT" | grep "Key ID" | awk '{print $NF}')
SECRET_KEY=$(echo "$KEY_OUTPUT" | grep "Secret key" | awk '{print $NF}')

if [ -z "$KEY_ID" ] || [ -z "$SECRET_KEY" ]; then
  echo "エラー: キー情報の取得に失敗しました。出力:"
  echo "$KEY_OUTPUT"
  exit 1
fi
echo "  キー作成完了: $KEY_ID"

# 3. バケットを作成（既存なら無視）
echo "[3/4] バケット '$BUCKET' を作成..."
$GARAGE bucket create "$BUCKET" 2>/dev/null || echo "  バケット既存のためスキップ"

# 4. キーにバケットへのアクセス権を付与（owner 権限も付与して CORS 設定を可能にする）
echo "[4/4] アクセス権を付与..."
$GARAGE bucket allow --read --write --owner "$BUCKET" --key "$KEY_ID"

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
