import {
  checkBrightness,
  checkMotion,
} from './useFrameCheck'

// JSDOM は ImageData をサポートしていないため、テスト用ポリフィルを定義する
class ImageDataPolyfill {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
}

if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as unknown as Record<string, unknown>).ImageData = ImageDataPolyfill
}

const makeImageData = (
  width: number,
  height: number,
  fillValue: number,
): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillValue     // R
    data[i + 1] = fillValue // G
    data[i + 2] = fillValue // B
    data[i + 3] = 255       // A
  }
  return new ImageData(data, width, height)
}

/** 2フレームの差分平均が指定値になる ImageData ペアを生成するヘルパー */
const makeImageDataPairWithMotion = (
  motionValue: number,
): { current: ImageData; previous: ImageData } => {
  const width = 4
  const height = 4
  const prevData = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < prevData.length; i += 4) {
    prevData[i] = 128
    prevData[i + 1] = 128
    prevData[i + 2] = 128
    prevData[i + 3] = 255
  }
  const currData = new Uint8ClampedArray(width * height * 4)
  const diff = Math.min(255, Math.max(0, Math.round(motionValue)))
  // R/G/B すべてに差分を与えることで、ピクセルあたりの平均差分 = diff になる
  for (let i = 0; i < currData.length; i += 4) {
    currData[i] = Math.min(255, 128 + diff)     // R
    currData[i + 1] = Math.min(255, 128 + diff) // G
    currData[i + 2] = Math.min(255, 128 + diff) // B
    currData[i + 3] = 255
  }
  return {
    current: new ImageData(currData, width, height),
    previous: new ImageData(prevData, width, height),
  }
}

describe('checkBrightness', () => {
  it('平均輝度が 80 未満のとき false を返す', () => {
    const imageData = makeImageData(4, 4, 79)
    expect(checkBrightness(imageData)).toBe(false)
  })

  it('平均輝度が 80 のとき true を返す', () => {
    const imageData = makeImageData(4, 4, 80)
    expect(checkBrightness(imageData)).toBe(true)
  })

  it('平均輝度が 80 超のとき true を返す', () => {
    const imageData = makeImageData(4, 4, 200)
    expect(checkBrightness(imageData)).toBe(true)
  })
})

describe('checkMotion', () => {
  it('フレーム間差分が 10 以上のとき false を返す', () => {
    const { current, previous } = makeImageDataPairWithMotion(10)
    expect(checkMotion(current, previous)).toBe(false)
  })

  it('フレーム間差分が 10 未満のとき true を返す', () => {
    const { current, previous } = makeImageDataPairWithMotion(3)
    expect(checkMotion(current, previous)).toBe(true)
  })

  it('同一フレームのとき true を返す（差分 0）', () => {
    const imageData = makeImageData(4, 4, 128)
    expect(checkMotion(imageData, imageData)).toBe(true)
  })
})
