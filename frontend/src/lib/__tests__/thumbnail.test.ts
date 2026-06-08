import { generateThumbnail, THUMBNAIL_MAX_PX } from '@/lib/thumbnail'

// jsdom では canvas.toBlob が未実装なのでスタブする
const mockToBlob = jest.fn((cb: (b: Blob | null) => void, _type: string, _q: number) => {
  cb(new Blob(['fake'], { type: 'image/jpeg' }))
})

// Canvas context も jsdom では未実装
const mockDrawImage = jest.fn()
const mockGetContext = jest.fn(() => ({
  drawImage: mockDrawImage,
}))

beforeEach(() => {
  // HTMLCanvasElement.prototype.toBlob をモック
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: mockToBlob,
    writable: true,
  })

  // HTMLCanvasElement.prototype.getContext をモック
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: mockGetContext,
    writable: true,
  })

  // HTMLImageElement のロードをシミュレート
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set(src: string) {
      // src セット後すぐに onload を呼ぶ
      Object.defineProperty(this, 'naturalWidth', { value: 600, configurable: true })
      Object.defineProperty(this, 'naturalHeight', { value: 400, configurable: true })
      Object.defineProperty(this, 'width', { value: 600, configurable: true })
      Object.defineProperty(this, 'height', { value: 400, configurable: true })
      setTimeout(() => this.onload?.(), 0)
    },
    configurable: true,
  })

  jest.clearAllMocks()
})

describe('generateThumbnail', () => {
  it('600x400 画像を 300x200 にリサイズして JPEG Blob を返す', async () => {
    const blob = await generateThumbnail('data:image/jpeg;base64,/9j/fake')
    expect(blob).toBeInstanceOf(Blob)
    expect(mockToBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.7,
    )
  })

  it(`長辺が ${THUMBNAIL_MAX_PX} 以下の画像はリサイズされない`, async () => {
    // 100x80 画像をモック
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set() {
        Object.defineProperty(this, 'width', { value: 100, configurable: true })
        Object.defineProperty(this, 'height', { value: 80, configurable: true })
        setTimeout(() => this.onload?.(), 0)
      },
      configurable: true,
    })
    await generateThumbnail('data:image/jpeg;base64,/9j/tiny')
    // canvas.width と canvas.height が 100x80 のままであることを確認
    expect(mockDrawImage).toHaveBeenCalledWith(
      expect.any(HTMLImageElement),
      0,
      0,
      100,
      80,
    )
  })

  it('toBlob が null を返した場合は reject する', async () => {
    mockToBlob.mockImplementationOnce((cb) => cb(null))
    await expect(generateThumbnail('data:image/jpeg;base64,/9j/fail')).rejects.toThrow(
      'thumbnail generation failed',
    )
  })

  it('画像のロードに失敗した場合は reject する', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set() {
        setTimeout(() => this.onerror?.(), 0)
      },
      configurable: true,
    })
    await expect(generateThumbnail('data:invalid')).rejects.toThrow('image load failed')
  })
})
