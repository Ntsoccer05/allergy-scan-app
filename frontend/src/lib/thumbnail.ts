export const THUMBNAIL_MAX_PX = 300
const THUMBNAIL_QUALITY = 0.7

/**
 * dataUrl で渡された画像を長辺 THUMBNAIL_MAX_PX 以下に縮小した JPEG Blob を返す。
 * サムネイル用なので OCR 前処理を適用しない（オリジナル色調を保持する）。
 */
export const generateThumbnail = (dataUrl: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, THUMBNAIL_MAX_PX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('thumbnail generation failed'))),
        'image/jpeg',
        THUMBNAIL_QUALITY,
      )
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
