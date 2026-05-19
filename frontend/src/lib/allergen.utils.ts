import type {
  AllergenResult,
  DetectionType,
  HighlightItem,
  HighlightJudgment,
  Judgment,
} from '@/app/scan/scan.types'
import type { AllergySettings } from '@/app/settings/settings.types'

/**
 * OCR 結果の results[] から overall judgment を導出する。
 * 優先順位: 含む > 一部含む > 判定不能 > なし
 * results[] が空の場合はアレルゲン未設定と解釈して「なし」を返す。
 */
export const deriveOcrJudgment = (results: AllergenResult[]): Judgment => {
  if (!Array.isArray(results) || results.length === 0) return 'なし'
  if (results.some((r) => r.judgment === '含む')) return '含む'
  if (results.some((r) => r.judgment === '一部含む')) return '一部含む'
  if (results.some((r) => r.judgment === '判定不能')) return '判定不能'
  return 'なし'
}

/** detection_type → 絵文字＋ラベルのマッピング（patterns.md §パターン13 準拠） */
export const DETECTION_DISPLAY: Record<DetectionType, string> = {
  contains: '🔴 NG',
  partial: '🟡 注意',
  // ⚠️ 安全設計: may_contain は製造ラインのコンタミ。contains（NG）と混同禁止
  may_contain: '🟠 注意喚起',
} as const

/** highlights[] の judgment → Tailwind クラスのマッピング */
export const HIGHLIGHT_CLASS: Record<HighlightJudgment, string> = {
  ng: 'bg-red-200 text-red-900 rounded px-0.5',
  partial: 'bg-yellow-200 text-yellow-900 rounded px-0.5',
  may_contain: 'bg-orange-200 text-orange-900 rounded px-0.5',
} as const

type TextPart =
  | { highlight: false; text: string }
  | { highlight: true; text: string; judgment: HighlightJudgment }

/**
 * raw_text を highlights[].text で分割し、ハイライト有無のパーツ配列に変換する。
 * 同一テキストが複数箇所に出現する場合は全マッチをハイライトする。
 * dangerouslySetInnerHTML を使わず React コンポーネントの配列で安全に実装するための準備関数。
 */
export const splitByHighlights = (
  rawText: string,
  highlights: HighlightItem[],
): TextPart[] => {
  if (highlights.length === 0) return [{ highlight: false, text: rawText }]

  // highlights を出現位置順にソートするため、まずマッチ位置を収集する
  type MatchedSpan = { start: number; end: number; judgment: HighlightJudgment }
  const spans: MatchedSpan[] = []

  for (const hi of highlights) {
    const keyword = hi.text
    if (!keyword) continue
    let searchFrom = 0
    while (searchFrom < rawText.length) {
      const idx = rawText.indexOf(keyword, searchFrom)
      if (idx === -1) break
      spans.push({ start: idx, end: idx + keyword.length, judgment: hi.judgment })
      searchFrom = idx + keyword.length
    }
  }

  if (spans.length === 0) return [{ highlight: false, text: rawText }]

  // 重複・重なりを除去し start 順にソートする
  spans.sort((a, b) => a.start - b.start)
  const merged: MatchedSpan[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span.start < last.end) {
      // 重なっている場合は後者を end の大きい方に拡張（重なり除去）
      if (span.end > last.end) last.end = span.end
    } else {
      merged.push({ ...span })
    }
  }

  // パーツ配列を構築する
  const parts: TextPart[] = []
  let cursor = 0
  for (const span of merged) {
    if (cursor < span.start) {
      parts.push({ highlight: false, text: rawText.slice(cursor, span.start) })
    }
    parts.push({
      highlight: true,
      text: rawText.slice(span.start, span.end),
      judgment: span.judgment,
    })
    cursor = span.end
  }
  if (cursor < rawText.length) {
    parts.push({ highlight: false, text: rawText.slice(cursor) })
  }

  return parts
}

/**
 * allergy カテゴリー（mandatory / recommended）のアレルゲンを ON/OFF する。
 * enabled を ON にすると partialAlert も自動で ON になる（安全設計）。
 * enabled を OFF にすると partialAlert も自動で OFF になる。
 * 集約点: dry_principles.md § allergen toggle ロジック
 */
export const toggleAllergen = (
  allergies: AllergySettings,
  name: string,
): AllergySettings => {
  const current = allergies[name] ?? { enabled: false, partialAlert: false }
  const isEnabling = !current.enabled
  return {
    ...allergies,
    [name]: { enabled: isEnabling, partialAlert: isEnabling },
  }
}

/**
 * caution カテゴリー（addiction / skin）のアレルゲンを ON/OFF する。
 * 単純な enabled の反転のみ。partialAlert フィールドは持たない。
 * 集約点: dry_principles.md § allergen toggle ロジック
 */
export const toggleCaution = (
  allergies: AllergySettings,
  name: string,
): AllergySettings => {
  const current = allergies[name] ?? { enabled: false, partialAlert: false }
  return {
    ...allergies,
    [name]: { ...current, enabled: !current.enabled },
  }
}

/**
 * partialAlert（一部含む警告）を個別に ON/OFF する。
 * enabled が false の場合は変更不可（enabled ON が前提）。
 */
export const togglePartial = (
  allergies: AllergySettings,
  name: string,
): AllergySettings => {
  const current = allergies[name] ?? { enabled: false, partialAlert: false }
  // enabled が OFF の場合は partialAlert を変更しない
  if (!current.enabled) return allergies
  return {
    ...allergies,
    [name]: { ...current, partialAlert: !current.partialAlert },
  }
}
