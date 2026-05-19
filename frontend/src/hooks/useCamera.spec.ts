/**
 * useCamera のズーム機能ユニットテスト
 *
 * JSDOM 環境では MediaStream / MediaStreamTrack が存在しないため、
 * テスト専用モックで動作を検証する。
 */

import { renderHook, act } from '@testing-library/react'
import { useCamera } from './useCamera'

// ---- モックヘルパー ----

/** applyConstraints モック関数（テストごとにリセット） */
const mockApplyConstraints = jest.fn().mockResolvedValue(undefined)

/**
 * MediaStreamTrack のモックを生成する。
 * @param hasZoomCapability - getCapabilities() に zoom プロパティを含めるかどうか
 */
const makeMockTrack = (hasZoomCapability: boolean): Partial<MediaStreamTrack> => ({
  stop: jest.fn(),
  getCapabilities: (): MediaTrackCapabilities => {
    if (hasZoomCapability) {
      return { zoom: { min: 1, max: 5, step: 0.1 } } as unknown as MediaTrackCapabilities
    }
    return {} as MediaTrackCapabilities
  },
  applyConstraints: mockApplyConstraints,
})

/** MediaStream のモックを生成する */
const makeMockStream = (hasZoomCapability: boolean): Partial<MediaStream> => {
  const track = makeMockTrack(hasZoomCapability) as MediaStreamTrack
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  }
}

// ---- グローバルモック設定 ----

beforeEach(() => {
  mockApplyConstraints.mockClear()
})

/** getUserMedia が指定ストリームを返すよう navigator.mediaDevices をモックする */
const setupMediaDevicesMock = (stream: Partial<MediaStream>, supportedZoom: boolean): void => {
  Object.defineProperty(globalThis, 'navigator', {
    writable: true,
    value: {
      mediaDevices: {
        getUserMedia: jest.fn().mockResolvedValue(stream),
        getSupportedConstraints: jest.fn().mockReturnValue({ zoom: supportedZoom }),
      },
    },
  })
}

// ---- テスト ----

describe('useCamera - ズームクランプ', () => {
  beforeEach(() => {
    // ズームクランプのテストでは startCamera は呼ばないため、
    // 最低限の navigator.mediaDevices を定義しておく
    setupMediaDevicesMock(makeMockStream(false), false)
  })

  it('setZoom(0.5) を呼ぶと zoomLevel が 1.0（最小値クランプ）になる', async () => {
    const { result } = renderHook(() => useCamera())

    act(() => {
      result.current.setZoom(0.5)
    })

    expect(result.current.zoomLevel).toBe(1.0)
  })

  it('setZoom(6) を呼ぶと zoomLevel が 5.0（最大値クランプ）になる', async () => {
    const { result } = renderHook(() => useCamera())

    act(() => {
      result.current.setZoom(6)
    })

    expect(result.current.zoomLevel).toBe(5.0)
  })
})

describe('useCamera - ハードウェアズームあり', () => {
  beforeEach(() => {
    const stream = makeMockStream(true)
    setupMediaDevicesMock(stream, true)
  })

  it('startCamera 後に setZoom(2) を呼ぶと applyConstraints が { advanced: [{ zoom: 2 }] } で 1 回呼ばれる', async () => {
    const { result } = renderHook(() => useCamera())

    await act(async () => {
      await result.current.startCamera()
    })

    act(() => {
      result.current.setZoom(2)
    })

    expect(mockApplyConstraints).toHaveBeenCalledTimes(1)
    expect(mockApplyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] })
  })
})

describe('useCamera - ハードウェアズームなし（デジタルズームフォールバック）', () => {
  beforeEach(() => {
    const stream = makeMockStream(false)
    setupMediaDevicesMock(stream, false)
  })

  it('startCamera 後に setZoom(2) を呼ぶと applyConstraints が呼ばれず zoomLevel が 2 になる', async () => {
    const { result } = renderHook(() => useCamera())

    await act(async () => {
      await result.current.startCamera()
    })

    act(() => {
      result.current.setZoom(2)
    })

    expect(mockApplyConstraints).not.toHaveBeenCalled()
    expect(result.current.zoomLevel).toBe(2)
  })
})

describe('useCamera - toggleFacingMode', () => {
  beforeEach(() => {
    setupMediaDevicesMock(makeMockStream(false), false)
  })

  it('toggleFacingMode を呼ぶと facingMode が environment から user に反転する', async () => {
    const { result } = renderHook(() => useCamera())
    expect(result.current.facingMode).toBe('environment')

    await act(async () => {
      result.current.toggleFacingMode()
    })

    expect(result.current.facingMode).toBe('user')
  })

  it('toggleFacingMode を2回呼ぶと facingMode が environment に戻る', async () => {
    const { result } = renderHook(() => useCamera())

    await act(async () => {
      result.current.toggleFacingMode()
    })
    await act(async () => {
      result.current.toggleFacingMode()
    })

    expect(result.current.facingMode).toBe('environment')
  })
})
