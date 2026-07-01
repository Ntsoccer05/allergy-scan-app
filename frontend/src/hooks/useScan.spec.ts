import { renderHook, act, waitFor } from '@testing-library/react'
import { scanReducer, initialState, useScan } from './useScan'
import type { State } from './useScan'
import type { OcrApiResponse } from '@/lib/api/scan.api'

// --- useScan の依存 Hook をすべてモック（jsdom 環境では MediaStream 等が動作しないため） ---
// captureFrame は各テストで mockReturnValue を設定する（jest.mock ファクトリ内では ImageData が未定義のため）
const mockCaptureFrame = jest.fn()
jest.mock('./useCamera', () => ({
  useCamera: () => ({
    videoRef: { current: null },
    captureFrame: mockCaptureFrame,
    startCamera: jest.fn().mockResolvedValue(undefined),
    stopCamera: jest.fn(),
    zoomLevel: 1,
    setZoom: jest.fn(),
    supportsHardwareZoom: false,
    facingMode: 'environment',
    toggleFacingMode: jest.fn(),
  }),
}))

jest.mock('./useBarcode', () => ({
  useBarcode: () => ({
    // バーコードを検出しない → OCR フローへ進む
    detectFromImageData: jest.fn().mockResolvedValue(null),
  }),
}))

const mockScanOcrStream = jest.fn()
const mockSaveHistory = jest.fn().mockResolvedValue({ id: 'hist-1' })
const mockPatchLocation = jest.fn().mockResolvedValue(undefined)
const mockPatchHistoryFields = jest.fn().mockResolvedValue(undefined)
const mockFetchPresignedUrl = jest.fn().mockResolvedValue({ url: 'https://s3.example.com/upload', s3_key: 'key-1' })
const mockPutS3 = jest.fn().mockResolvedValue(undefined)
const mockScanBarcodeWithCache = jest.fn()
const mockFetchPlaceCandidatesApi = jest.fn()

jest.mock('./useScanApi', () => ({
  useScanApi: () => ({
    scanOcrStream: mockScanOcrStream,
    saveHistory: mockSaveHistory,
    patchLocation: mockPatchLocation,
    patchHistoryFields: mockPatchHistoryFields,
    fetchPresignedUrl: mockFetchPresignedUrl,
    putS3: mockPutS3,
    scanBarcodeWithCache: mockScanBarcodeWithCache,
    fetchPlaceCandidates: mockFetchPlaceCandidatesApi,
  }),
}))

jest.mock('@/lib/thumbnail', () => ({
  generateThumbnail: jest.fn().mockResolvedValue(new Blob(['thumb'], { type: 'image/jpeg' })),
}))

jest.mock('@/lib/s3.utils', () => ({
  getPublicUrlFromPresigned: jest.fn().mockReturnValue('https://s3.example.com/thumb.jpg'),
}))

// @tanstack/react-query の useQueryClient をモック（useScanApi の実装が使用）
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
  }),
}))

// jsdom では HTMLCanvasElement.toBlob がデフォルト実装を持たないため geolocation テストの beforeEach でモックを設定する

/** geolocation テストで使う最小限の OCR レスポンス */
const makeOcrResponse = (): OcrApiResponse => ({
  raw_text: 'テスト原材料',
  confidence: 'high',
  results: [],
  highlights: [],
  incomplete: false,
  price: null,
  price_with_tax: null,
  price_confidence: null,
})

describe('scanReducer', () => {
  it('初期状態は idle', () => {
    expect(initialState.scanState).toBe('idle')
  })

  it('START_CAMERA → idle with error/result cleared', () => {
    const state = scanReducer(
      { scanState: 'error', error: 'api_error', result: null, previewDataUrl: null, capturedImageUrl: null, thumbnailUrl: null },
      { type: 'START_CAMERA' },
    )
    expect(state.scanState).toBe('idle')
    expect(state.error).toBeNull()
  })

  it('PREVIEW → preview state with imageDataUrl', () => {
    const state = scanReducer(
      { scanState: 'idle', error: null, result: null, previewDataUrl: null, capturedImageUrl: null, thumbnailUrl: null },
      { type: 'PREVIEW', imageDataUrl: 'data:image/jpeg;base64,...' },
    )
    expect(state.scanState).toBe('preview')
    expect(state.previewDataUrl).toBe('data:image/jpeg;base64,...')
  })

  it('ERROR daily_limit_exceeded → error state', () => {
    const state = scanReducer(
      { scanState: 'idle', error: null, result: null, previewDataUrl: null, capturedImageUrl: null, thumbnailUrl: null },
      { type: 'ERROR', error: 'daily_limit_exceeded' }
    )
    expect(state.scanState).toBe('error')
    expect(state.error).toBe('daily_limit_exceeded')
  })

  it('PROCESSING アクションで processing に遷移し previewDataUrl がクリアされる', () => {
    const previewState: State = { ...initialState, scanState: 'preview', previewDataUrl: 'data:image/jpeg;base64,...' }
    const state = scanReducer(previewState, { type: 'PROCESSING' })
    expect(state.scanState).toBe('processing')
    expect(state.previewDataUrl).toBeNull()
  })

  it('RESULT アクションで result に遷移する', () => {
    const processingState: State = { ...initialState, scanState: 'processing' }
    const resultPayload = {
      type: 'barcode' as const,
      data: {
        found: true,
        from_cache: false,
        product_name: 'テスト商品',
        allergens: { contains: [], partial: [], components: [] },
        judgment: 'ok' as const,
        detected: [],
        risk_level: null,
      },
    }
    const state = scanReducer(processingState, {
      type: 'RESULT',
      payload: resultPayload,
    })
    expect(state.scanState).toBe('result')
    expect(state.result).toEqual(resultPayload)
  })

  it('api_error 発生時に error 状態に遷移する', () => {
    const processingState: State = { ...initialState, scanState: 'processing' }
    const state = scanReducer(processingState, {
      type: 'ERROR',
      error: 'api_error',
    })
    expect(state.scanState).toBe('error')
    expect(state.error).toBe('api_error')
  })

  it('incomplete エラー発生時に error 状態に遷移する', () => {
    const processingState: State = { ...initialState, scanState: 'processing' }
    const state = scanReducer(processingState, {
      type: 'ERROR',
      error: 'incomplete',
    })
    expect(state.scanState).toBe('error')
  })

  it('confidence_low エラー発生時に error 状態に遷移する', () => {
    const processingState: State = { ...initialState, scanState: 'processing' }
    const state = scanReducer(processingState, {
      type: 'ERROR',
      error: 'confidence_low',
    })
    expect(state.scanState).toBe('error')
    expect(state.error).toBe('confidence_low')
  })

  it('RESET アクションで初期状態に戻る', () => {
    const resultState: State = {
      scanState: 'result',
      error: null,
      result: {
        type: 'barcode',
        data: { found: true, from_cache: false },
      },
      previewDataUrl: null,
      capturedImageUrl: null,
      thumbnailUrl: null,
    }
    const state = scanReducer(resultState, { type: 'RESET' })
    expect(state).toEqual(initialState)
  })

  it('RESULT アクション（ocr）で result 状態に遷移する', () => {
    const processingState: State = { ...initialState, scanState: 'processing' }
    const state = scanReducer(processingState, {
      type: 'RESULT',
      payload: {
        type: 'ocr',
        data: {
          raw_text: '原材料: 卵',
          confidence: 'high',
          results: [],
          highlights: [],
          incomplete: false,
          price: null,
          price_with_tax: null,
          price_confidence: null,
        },
      },
    })
    expect(state.scanState).toBe('result')
  })

  it('idle → preview → processing → result の一連の遷移', () => {
    let state = initialState

    state = scanReducer(state, { type: 'START_CAMERA' })
    expect(state.scanState).toBe('idle')

    state = scanReducer(state, { type: 'PREVIEW', imageDataUrl: 'data:image/jpeg;base64,...' })
    expect(state.scanState).toBe('preview')

    state = scanReducer(state, { type: 'PROCESSING' })
    expect(state.scanState).toBe('processing')

    state = scanReducer(state, {
      type: 'RESULT',
      payload: {
        type: 'ocr',
        data: {
          raw_text: '原材料: 卵',
          confidence: 'high',
          results: [
            {
              allergen: '卵',
              judgment: '含む',
              detection_type: 'contains',
              detected: ['卵'],
              risk_level: 'high',
              reason: '卵を検出',
            },
          ],
          highlights: [{ text: '卵', judgment: 'ng' as const }],
          incomplete: false,
          price: null,
          price_with_tax: null,
          price_confidence: null,
        },
      },
    })
    expect(state.scanState).toBe('result')
  })
})

// ---------------------------------------------------------------------------
// useScan Hook の geolocation 連携テスト
// ---------------------------------------------------------------------------

/**
 * useScan の OCR フロー全体（setInterval → tick → runOcrFlow）を直接テストするのは
 * jsdom 環境での window.setInterval の挙動の問題から困難なため、
 * geolocation 連携テストは「startScan 後に geolocationRef が設定されること」を
 * patchLocation の引数検証で確認する形式で実装する。
 *
 * テスト戦略:
 * 1. geolocation を各ケースでモック設定
 * 2. startScan を呼ぶ
 * 3. 「結果あり + historyId あり」の状態を直接作り出し、registerLocation を呼ぶ
 * 4. patchLocation の引数で lat/lng が正しく渡されたかを確認
 *
 * ただし scanHistoryIdRef は runOcrFlow 完了後に設定されるため、
 * より直接的に useScan の runOcrFlow を経由して scanOcr 引数を検証するには
 * setInterval の tick を手動で実行する必要がある。
 *
 * そのため、setInterval のコールバックを手動で取得・実行するモックを使用する。
 */
describe('useScan - geolocation 連携', () => {
  const originalGeolocation = global.navigator.geolocation
  // setInterval コールバックを手動実行するための参照
  let capturedIntervalCallback: (() => void) | null = null

  beforeEach(() => {
    mockScanOcrStream.mockReset()
    mockScanOcrStream.mockImplementation(() => (async function* () {
      yield { type: 'result' as const, data: makeOcrResponse() }
    })())
    mockSaveHistory.mockResolvedValue({ id: 'hist-1' })
    mockFetchPresignedUrl.mockResolvedValue({ url: 'https://s3.example.com/upload', s3_key: 'key-1' })
    mockPutS3.mockResolvedValue(undefined)
    mockCaptureFrame.mockReturnValue({ width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } as unknown as ImageData)

    // jsdom では HTMLCanvasElement.toBlob が未実装のためモックする
    const originalCreateElement = document.createElement.bind(document)
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        const canvas = originalCreateElement('canvas') as HTMLCanvasElement
        canvas.toBlob = (callback: BlobCallback) => {
          callback(new Blob(['fake-image'], { type: 'image/jpeg' }))
        }
        jest.spyOn(canvas, 'getContext').mockReturnValue({
          putImageData: jest.fn(),
          drawImage: jest.fn(),
          getImageData: jest.fn().mockReturnValue({
            data: new Uint8ClampedArray(4),
            width: 1,
            height: 1,
          }),
        } as unknown as CanvasRenderingContext2D)
        return canvas
      }
      return originalCreateElement(tagName)
    })

    // jsdom では window.matchMedia が未実装のためモックする（isPC() が内部で使用）
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })

    // setInterval をモックして tick コールバックをキャプチャする
    capturedIntervalCallback = null
    jest.spyOn(global, 'setInterval').mockImplementation((callback, _interval) => {
      capturedIntervalCallback = callback as () => void
      return 1 as unknown as ReturnType<typeof setInterval>
    })
    jest.spyOn(global, 'clearInterval').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    capturedIntervalCallback = null
    Object.defineProperty(global.navigator, 'geolocation', {
      value: originalGeolocation,
      writable: true,
      configurable: true,
    })
  })

  it('geolocation 成功時: postOcr（scanOcr）に lat/lng が渡される', async () => {
    // GPS 取得成功のモック（即時コールバック）
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (successCallback: PositionCallback) => {
          successCallback({
            coords: { latitude: 35.681236, longitude: 139.767125, accuracy: 10 } as GeolocationCoordinates,
            timestamp: Date.now(),
          } as GeolocationPosition)
        },
      },
      writable: true,
      configurable: true,
    })

    const { result, unmount } = renderHook(() => useScan())

    await act(async () => {
      await result.current.startScan()
    })

    // manualCapture で runOcrFlow を直接トリガー（tick の非同期チェーンより確実）
    await act(async () => {
      await result.current.manualCapture()
    })

    expect(mockScanOcrStream).toHaveBeenCalled()
    const callArg = mockScanOcrStream.mock.calls[0]?.[0] as { s3Key: string; lat?: number; lng?: number }
    expect(callArg.lat).toBeCloseTo(35.681236)
    expect(callArg.lng).toBeCloseTo(139.767125)

    unmount()
  })

  it('geolocation 失敗（権限拒否）時: lat/lng なしで scanOcr が呼ばれる（スキャン継続）', async () => {
    // GPS 取得失敗（権限拒否）のモック
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (
          _successCallback: PositionCallback,
          errorCallback: PositionErrorCallback,
        ) => {
          errorCallback({
            code: 1,
            message: 'Permission denied',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError)
        },
      },
      writable: true,
      configurable: true,
    })

    const { result, unmount } = renderHook(() => useScan())

    await act(async () => {
      await result.current.startScan()
    })

    await act(async () => {
      await result.current.manualCapture()
    })

    expect(mockScanOcrStream).toHaveBeenCalled()
    const callArg = mockScanOcrStream.mock.calls[0]?.[0] as { s3Key: string; lat?: number; lng?: number }
    expect(callArg.lat).toBeUndefined()
    expect(callArg.lng).toBeUndefined()

    unmount()
  })

  it('geolocation 非対応（navigator.geolocation が undefined）時: lat/lng なしで scanOcrStream が呼ばれる', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const { result, unmount } = renderHook(() => useScan())

    await act(async () => {
      await result.current.startScan()
    })

    await act(async () => {
      await result.current.manualCapture()
    })

    expect(mockScanOcrStream).toHaveBeenCalled()
    const callArg = mockScanOcrStream.mock.calls[0]?.[0] as { s3Key: string; lat?: number; lng?: number }
    expect(callArg.lat).toBeUndefined()
    expect(callArg.lng).toBeUndefined()

    unmount()
  })

  it('registerLocation: スキャン完了後に lat/lng/place_id つきで patchLocation が呼ばれる', async () => {
    mockPatchLocation.mockClear()
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (successCallback: PositionCallback) => {
          successCallback({
            coords: { latitude: 35.681236, longitude: 139.767125, accuracy: 10 } as GeolocationCoordinates,
            timestamp: Date.now(),
          } as GeolocationPosition)
        },
      },
      writable: true,
      configurable: true,
    })

    const { result, unmount } = renderHook(() => useScan())

    await act(async () => {
      await result.current.startScan()
    })

    // スキャン完了で scanHistoryIdRef がセットされる（saveHistory フォールバックが id を返す）
    await act(async () => {
      await result.current.manualCapture()
    })

    act(() => {
      result.current.registerLocation('セブンイレブン渋谷店', 'place-1')
    })

    expect(mockPatchLocation).toHaveBeenCalledWith('hist-1', {
      store_name: 'セブンイレブン渋谷店',
      lat: 35.681236,
      lng: 139.767125,
      place_id: 'place-1',
    })

    unmount()
  })

  it('registerLocation: placeId なし（住所のみ登録）の場合 place_id を含めない', async () => {
    mockPatchLocation.mockClear()
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (successCallback: PositionCallback) => {
          successCallback({
            coords: { latitude: 35.681236, longitude: 139.767125, accuracy: 10 } as GeolocationCoordinates,
            timestamp: Date.now(),
          } as GeolocationPosition)
        },
      },
      writable: true,
      configurable: true,
    })

    const { result, unmount } = renderHook(() => useScan())

    await act(async () => {
      await result.current.startScan()
    })
    await act(async () => {
      await result.current.manualCapture()
    })

    act(() => {
      result.current.registerLocation('東京都千代田区丸の内一丁目')
    })

    expect(mockPatchLocation).toHaveBeenCalledWith('hist-1', {
      store_name: '東京都千代田区丸の内一丁目',
      lat: 35.681236,
      lng: 139.767125,
    })

    unmount()
  })

  it('fetchPlaceCandidates: GPS 取得済みなら座標つきで API を呼び、結果を返す', async () => {
    mockFetchPlaceCandidatesApi.mockResolvedValue({
      address: '東京都千代田区丸の内一丁目',
      candidates: [{ name: 'セブンイレブン丸の内店', placeId: 'place-1' }],
    })
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (successCallback: PositionCallback) => {
          successCallback({
            coords: { latitude: 35.681236, longitude: 139.767125, accuracy: 10 } as GeolocationCoordinates,
            timestamp: Date.now(),
          } as GeolocationPosition)
        },
      },
      writable: true,
      configurable: true,
    })

    const { result, unmount } = renderHook(() => useScan())

    await act(async () => {
      await result.current.startScan()
    })

    const candidates = await result.current.fetchPlaceCandidates()

    expect(mockFetchPlaceCandidatesApi).toHaveBeenCalledWith(35.681236, 139.767125, undefined)
    expect(candidates?.address).toBe('東京都千代田区丸の内一丁目')
    expect(candidates?.candidates).toHaveLength(1)

    unmount()
  })

  it('fetchPlaceCandidates: GPS 未取得なら API を呼ばず null を返す', async () => {
    mockFetchPlaceCandidatesApi.mockClear()
    Object.defineProperty(global.navigator, 'geolocation', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const { result, unmount } = renderHook(() => useScan())

    await act(async () => {
      await result.current.startScan()
    })

    const candidates = await result.current.fetchPlaceCandidates()

    expect(candidates).toBeNull()
    expect(mockFetchPlaceCandidatesApi).not.toHaveBeenCalled()

    unmount()
  })
})

// ---------------------------------------------------------------------------
// uploadAndScanImage テスト
// ---------------------------------------------------------------------------

describe('useScan - uploadAndScanImage', () => {
  beforeEach(() => {
    mockScanOcrStream.mockReset()
    mockScanOcrStream.mockImplementation(() => (async function* () {
      yield { type: 'result' as const, data: makeOcrResponse() }
    })())
    mockSaveHistory.mockResolvedValue({ id: 'hist-1' })
    mockFetchPresignedUrl.mockResolvedValue({ url: 'https://s3.example.com/upload', s3_key: 'key-1' })
    mockPutS3.mockResolvedValue(undefined)

    // createImageBitmap は jsdom でサポートされていないためモックする
    global.createImageBitmap = jest.fn().mockResolvedValue({
      width: 640,
      height: 480,
    })

    // jsdom では HTMLCanvasElement.toBlob が未実装のためモックする
    const originalCreateElement = document.createElement.bind(document)
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        const canvas = originalCreateElement('canvas') as HTMLCanvasElement
        canvas.toBlob = (callback: BlobCallback) => {
          callback(new Blob(['fake-image'], { type: 'image/jpeg' }))
        }
        jest.spyOn(canvas, 'getContext').mockReturnValue({
          putImageData: jest.fn(),
          drawImage: jest.fn(),
          getImageData: jest.fn().mockReturnValue({
            data: new Uint8ClampedArray(4),
            width: 640,
            height: 480,
          }),
        } as unknown as CanvasRenderingContext2D)
        return canvas
      }
      return originalCreateElement(tagName)
    })

    // jsdom では window.matchMedia が未実装のためモックする
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })

    jest.spyOn(global, 'setInterval').mockImplementation((_callback, _interval) => {
      return 1 as unknown as ReturnType<typeof setInterval>
    })
    jest.spyOn(global, 'clearInterval').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uploadAndScanImage が呼ばれると scanState が processing → result に遷移する', async () => {
    const { result, unmount } = renderHook(() => useScan())

    await act(async () => {
      await result.current.startScan()
    })

    const fakeFile = new File(['fake-image'], 'test.jpg', { type: 'image/jpeg' })

    await act(async () => {
      await result.current.uploadAndScanImage(fakeFile)
    })

    await waitFor(() => {
      expect(result.current.scanState).toBe('result')
    })

    expect(mockFetchPresignedUrl).toHaveBeenCalled()
    expect(mockPutS3).toHaveBeenCalled()
    expect(mockScanOcrStream).toHaveBeenCalled()

    unmount()
  })

  it('OCR ストリームがエラーを返した場合、scanState が error に遷移する', async () => {
    mockScanOcrStream.mockReset()
    mockScanOcrStream.mockImplementation(() => (async function* () {
      yield { type: 'error' as const, code: 'UNKNOWN_ERROR', message: 'Server error' }
    })())

    const { result, unmount } = renderHook(() => useScan())

    await act(async () => {
      await result.current.startScan()
    })

    const fakeFile = new File(['fake-image'], 'test.jpg', { type: 'image/jpeg' })

    await act(async () => {
      await result.current.uploadAndScanImage(fakeFile)
    })

    await waitFor(() => {
      expect(result.current.scanState).toBe('error')
    })

    unmount()
  })
})
