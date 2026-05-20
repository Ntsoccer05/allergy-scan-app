/** アレルゲン1品目の設定値 */
export type AllergenSetting = {
  enabled: boolean
  partialAlert: boolean
}

/**
 * ユーザーのアレルギー設定マップ。
 * キーは allergens.name と完全一致する。
 */
export type AllergySettings = Record<string, AllergenSetting>

/** ユーザー設定（GET /users/me のレスポンス型） */
export type UserProfile = {
  id: string
  allergies: AllergySettings
  locale: 'ja' | 'en'
  onboarding_done: boolean
}

/** ユーザー設定更新のリクエストボディ（PUT /users/me） */
export type UpdateUserBody = {
  allergies?: AllergySettings
  locale?: 'ja' | 'en'
  onboarding_done?: boolean
}

/** アレルゲンマスターの1品目 */
export type AllergenItem = {
  name: string
  display_name: string
  emoji: string | null
  display_order: number
  judgment_type: 'allergy' | 'caution'
}

/** GET /allergens のレスポンス要素（カテゴリーグループ） */
export type AllergenGroup = {
  category: 'mandatory' | 'recommended' | 'addiction' | 'skin'
  label: string
  items: AllergenItem[]
}
