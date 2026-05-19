import {
  toggleAllergen,
  toggleCaution,
  togglePartial,
} from '@/lib/allergen.utils'
import type { AllergySettings } from '@/app/settings/settings.types'

const makeAllergies = (
  overrides: Record<string, { enabled: boolean; partialAlert: boolean }> = {},
): AllergySettings => ({
  乳: { enabled: false, partialAlert: false },
  卵: { enabled: true, partialAlert: true },
  アルコール: { enabled: false, partialAlert: false },
  ...overrides,
})

describe('toggleAllergen', () => {
  it('enabled を true にすると partialAlert も true になる', () => {
    const allergies = makeAllergies({ 乳: { enabled: false, partialAlert: false } })
    const result = toggleAllergen(allergies, '乳')
    expect(result['乳'].enabled).toBe(true)
    expect(result['乳'].partialAlert).toBe(true)
  })

  it('enabled を false にすると partialAlert も false になる', () => {
    const allergies = makeAllergies({ 卵: { enabled: true, partialAlert: true } })
    const result = toggleAllergen(allergies, '卵')
    expect(result['卵'].enabled).toBe(false)
    expect(result['卵'].partialAlert).toBe(false)
  })

  it('他のアレルゲンの設定は変更されない', () => {
    const allergies = makeAllergies()
    const result = toggleAllergen(allergies, '乳')
    expect(result['卵']).toEqual({ enabled: true, partialAlert: true })
    expect(result['アルコール']).toEqual({ enabled: false, partialAlert: false })
  })

  it('allergies に存在しないキーでも正しく動作する（デフォルト値で初期化）', () => {
    const allergies: AllergySettings = {}
    const result = toggleAllergen(allergies, '小麦')
    expect(result['小麦'].enabled).toBe(true)
    expect(result['小麦'].partialAlert).toBe(true)
  })
})

describe('toggleCaution', () => {
  it('enabled が false のとき true に反転する', () => {
    const allergies = makeAllergies({ アルコール: { enabled: false, partialAlert: false } })
    const result = toggleCaution(allergies, 'アルコール')
    expect(result['アルコール'].enabled).toBe(true)
  })

  it('enabled が true のとき false に反転する', () => {
    const allergies = makeAllergies({ アルコール: { enabled: true, partialAlert: false } })
    const result = toggleCaution(allergies, 'アルコール')
    expect(result['アルコール'].enabled).toBe(false)
  })

  it('partialAlert フィールドは変化しない（true の場合）', () => {
    const allergies = makeAllergies({ アルコール: { enabled: true, partialAlert: true } })
    const result = toggleCaution(allergies, 'アルコール')
    // partialAlert は変更されない（caution カテゴリーは単純 ON/OFF のみ）
    expect(result['アルコール'].partialAlert).toBe(true)
  })

  it('partialAlert フィールドは変化しない（false の場合）', () => {
    const allergies = makeAllergies({ アルコール: { enabled: false, partialAlert: false } })
    const result = toggleCaution(allergies, 'アルコール')
    expect(result['アルコール'].partialAlert).toBe(false)
  })

  it('他のアレルゲンの設定は変更されない', () => {
    const allergies = makeAllergies()
    const result = toggleCaution(allergies, 'アルコール')
    expect(result['乳']).toEqual({ enabled: false, partialAlert: false })
    expect(result['卵']).toEqual({ enabled: true, partialAlert: true })
  })
})

describe('togglePartial', () => {
  it('enabled が true のとき partialAlert を反転する（false → true）', () => {
    const allergies = makeAllergies({ 乳: { enabled: true, partialAlert: false } })
    const result = togglePartial(allergies, '乳')
    expect(result['乳'].partialAlert).toBe(true)
    expect(result['乳'].enabled).toBe(true)
  })

  it('enabled が true のとき partialAlert を反転する（true → false）', () => {
    const allergies = makeAllergies({ 乳: { enabled: true, partialAlert: true } })
    const result = togglePartial(allergies, '乳')
    expect(result['乳'].partialAlert).toBe(false)
    expect(result['乳'].enabled).toBe(true)
  })

  it('enabled が false のとき partialAlert は変化しない', () => {
    const allergies = makeAllergies({ 乳: { enabled: false, partialAlert: false } })
    const result = togglePartial(allergies, '乳')
    expect(result['乳'].partialAlert).toBe(false)
    expect(result['乳'].enabled).toBe(false)
    // 元のオブジェクトと同じ参照を返す
    expect(result).toBe(allergies)
  })
})
