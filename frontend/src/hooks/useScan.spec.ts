import { scanReducer, initialState } from './useScan'
import type { State } from './useScan'

describe('scanReducer', () => {
  it('初期状態は idle', () => {
    expect(initialState.scanState).toBe('idle')
  })

  it('START_CAMERA アクションで detecting に遷移する', () => {
    const state = scanReducer(initialState, { type: 'START_CAMERA' })
    expect(state.scanState).toBe('detecting')
  })

  it('STABLE アクションで detecting → stable に遷移する', () => {
    const detectingState: State = { ...initialState, scanState: 'detecting' }
    const state = scanReducer(detectingState, { type: 'STABLE' })
    expect(state.scanState).toBe('stable')
  })

  it('detecting 以外の状態で STABLE を受けてもそのままの状態を返す', () => {
    const processingState: State = { ...initialState, scanState: 'processing' }
    const state = scanReducer(processingState, { type: 'STABLE' })
    expect(state.scanState).toBe('processing')
  })

  it('PROCESSING アクションで processing に遷移する', () => {
    const stableState: State = { ...initialState, scanState: 'stable' }
    const state = scanReducer(stableState, { type: 'PROCESSING' })
    expect(state.scanState).toBe('processing')
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

  it('api_error 発生時に idle に遷移する', () => {
    const processingState: State = { ...initialState, scanState: 'processing' }
    const state = scanReducer(processingState, {
      type: 'ERROR',
      error: 'api_error',
    })
    expect(state.scanState).toBe('idle')
    expect(state.error).toBe('api_error')
  })

  it('dark エラー発生時に detecting 継続（state が detecting のまま）', () => {
    const detectingState: State = { ...initialState, scanState: 'detecting' }
    const state = scanReducer(detectingState, {
      type: 'ERROR',
      error: 'dark',
    })
    expect(state.scanState).toBe('detecting')
    expect(state.error).toBe('dark')
  })

  it('blur エラー発生時に detecting 継続', () => {
    const detectingState: State = { ...initialState, scanState: 'detecting' }
    const state = scanReducer(detectingState, { type: 'ERROR', error: 'blur' })
    expect(state.scanState).toBe('detecting')
  })

  it('motion エラー発生時に detecting 継続', () => {
    const detectingState: State = { ...initialState, scanState: 'detecting' }
    const state = scanReducer(detectingState, {
      type: 'ERROR',
      error: 'motion',
    })
    expect(state.scanState).toBe('detecting')
  })

  it('incomplete エラー発生時に detecting 継続', () => {
    const detectingState: State = { ...initialState, scanState: 'detecting' }
    const state = scanReducer(detectingState, {
      type: 'ERROR',
      error: 'incomplete',
    })
    expect(state.scanState).toBe('detecting')
  })

  it('confidence_low エラー発生時に detecting 継続', () => {
    const detectingState: State = { ...initialState, scanState: 'detecting' }
    const state = scanReducer(detectingState, {
      type: 'ERROR',
      error: 'confidence_low',
    })
    expect(state.scanState).toBe('detecting')
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
    }
    const state = scanReducer(resultState, { type: 'RESET' })
    expect(state).toEqual(initialState)
  })

  it('idle → detecting → stable → processing → result の一連の遷移', () => {
    let state = initialState

    state = scanReducer(state, { type: 'START_CAMERA' })
    expect(state.scanState).toBe('detecting')

    state = scanReducer(state, { type: 'STABLE' })
    expect(state.scanState).toBe('stable')

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
