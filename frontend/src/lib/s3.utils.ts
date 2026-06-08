/**
 * Presigned PUT URL からブラウザが直接アクセス可能な公開 URL を生成する。
 *
 * 開発環境（NEXT_PUBLIC_S3_WEB_HOST が設定されている場合）:
 *   Garage の Website エンドポイントを使用する。
 *   path-style S3 URL: http://localhost:3900/bucket/key?X-Amz-...
 *   → virtual-hosted Web URL: http://bucket.localhost:3902/key
 *
 * 本番環境（NEXT_PUBLIC_S3_WEB_HOST 未設定）:
 *   クエリ文字列を除去した S3 API URL をそのまま返す（S3 バケットが公開設定済みを前提）。
 */
export const getPublicUrlFromPresigned = (presignedUrl: string): string => {
  const url = new URL(presignedUrl)
  url.search = ''

  const webHost = process.env.NEXT_PUBLIC_S3_WEB_HOST
  if (webHost) {
    // path-style S3 URL のパスから /bucket/key を分解して virtual-hosted 形式に変換
    const parts = url.pathname.slice(1).split('/')
    const bucket = parts[0]
    const key = parts.slice(1).join('/')
    return `http://${bucket}.${webHost}/${key}`
  }

  return url.toString()
}
