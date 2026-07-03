'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { TodayScanItem } from '@/hooks/useScanQueue'
import { ScanResultBody } from './ScanResultBody'

/** セッション内で blob URL を付与した表示用の型 */
type DisplayItem = TodayScanItem & { capturedImageUrl?: string | null }

const JUDGMENT_EMOJI: Record<TodayScanItem['judgment'], string> = {
  ng: '🔴',
  partial: '🟡',
  ok: '✅',
}

const MIN_HEIGHT = 200
const getDefaultHeight = (): number => Math.round(window.innerHeight * 0.6)
const getMaxHeight = (): number => Math.round(window.innerHeight * 0.92)

type Props = {
  items: DisplayItem[]
  isOpen: boolean
  onClose: () => void
  /** is_public を変更するコールバック。itemId は localStorage キー、historyId は PATCH 対象の DB ID。 */
  onTogglePublic?: (itemId: string, historyId: string, isPublic: boolean) => void
}

export const TodayScansSheet = ({ items, isOpen, onClose, onTogglePublic }: Props) => {
  const t = useTranslations('scan')
  const [selected, setSelected] = useState<DisplayItem | null>(null)
  const [panelHeight, setPanelHeight] = useState<number | null>(null)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)

  // items が更新されたとき（場所登録・サムネイル更新後）、表示中の selected を最新データに同期する
  useEffect(() => {
    if (!selected) return
    const updated = items.find((i) => i.id === selected.id)
    if (updated) setSelected(updated)
  // selected を依存に入れると無限ループになるため省く
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  if (!isOpen) return null

  const reversed = [...items].reverse()

  const judgmentLabel: Record<TodayScanItem['judgment'], string> = {
    ng: t('result.judgment.contains'),
    partial: t('result.judgment.partial'),
    ok: t('result.judgment.none'),
  }

  const handleDragStart = (clientY: number): void => {
    dragStartY.current = clientY
    dragStartHeight.current = panelHeight ?? getDefaultHeight()

    const onMouseMove = (e: MouseEvent): void => {
      const delta = dragStartY.current - e.clientY
      setPanelHeight(Math.max(MIN_HEIGHT, Math.min(getMaxHeight(), dragStartHeight.current + delta)))
    }
    const onTouchMove = (e: TouchEvent): void => {
      const currentY = e.touches[0]?.clientY ?? dragStartY.current
      const delta = dragStartY.current - currentY
      setPanelHeight(Math.max(MIN_HEIGHT, Math.min(getMaxHeight(), dragStartHeight.current + delta)))
    }
    const onEnd = (): void => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchmove', onTouchMove)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('mouseup', onEnd, { once: true })
    window.addEventListener('touchend', onEnd, { once: true })
  }

  const handleBack = (): void => {
    setSelected(null)
    setPanelHeight(null)
  }

  // 詳細ビュー
  if (selected) {
    const currentHeight = panelHeight ?? getDefaultHeight()

    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div
          className="relative bg-white rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: currentHeight }}
        >
          {/* ドラッグハンドル */}
          <div
            className="shrink-0 flex justify-center pt-2 pb-1 cursor-row-resize touch-none select-none"
            onMouseDown={(e) => { e.preventDefault(); handleDragStart(e.clientY) }}
            onTouchStart={(e) => { handleDragStart(e.touches[0]?.clientY ?? 0) }}
            aria-hidden="true"
          >
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* ヘッダー: 戻る + 閉じる */}
          <div className="flex items-center justify-between px-4 pb-1 shrink-0">
            <button
              type="button"
              onClick={handleBack}
              className="text-blue-600 text-sm"
            >
              {t('today.back')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>

          {/* 商品名 + 公開トグル（同一行） */}
          <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
            <h2 className="flex-1 text-base font-bold text-gray-900 truncate">
              {selected.productName ?? t('unnamed')}
            </h2>
            {selected.historyId && onTogglePublic && (
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-medium ${selected.isPublic ? 'text-blue-600' : 'text-gray-400'}`}>
                  {selected.isPublic ? t('result.visibility.public') : t('result.visibility.private')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!selected.isPublic}
                  onClick={() => {
                    const next = !selected.isPublic
                    setSelected({ ...selected, isPublic: next })
                    onTogglePublic(selected.id, selected.historyId!, next)
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    selected.isPublic ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      selected.isPublic ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* コンテンツ */}
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
            {/* サムネイル（S3 thumbnail 優先、なければ撮影画像の blob URL） */}
            {(selected.thumbnailUrl ?? selected.capturedImageUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={(selected.thumbnailUrl ?? selected.capturedImageUrl)!}
                alt=""
                className="h-24 w-24 object-cover rounded-xl shrink-0"
              />
            )}

            {/* 判定 */}
            <div className="flex items-center gap-2 text-2xl font-bold py-1">
              <span>{JUDGMENT_EMOJI[selected.judgment]}</span>
              <span className="text-gray-900">{judgmentLabel[selected.judgment]}</span>
            </div>

            {/* 店舗名・住所 */}
            {(selected.storeName || selected.address) && (
              <div className="text-sm text-gray-600 space-y-0.5">
                {selected.storeName && (
                  <div className="flex items-center gap-1.5">
                    <span>📍</span>
                    <span>{selected.storeName}</span>
                  </div>
                )}
                {selected.address && (
                  <div className="flex items-start gap-1.5 pl-5">
                    <span className="text-gray-400 text-xs leading-relaxed">{selected.address}</span>
                  </div>
                )}
              </div>
            )}


            {/* アレルゲン判定 + 原材料テキスト（ResultCard と同一形式） */}
            <ScanResultBody
              results={selected.results ?? []}
              highlights={selected.highlights ?? []}
              rawText={selected.rawText ?? null}
              judgment={selected.judgment}
            />

            {/* ⚠️ 安全設計: 免責表示は全判定で常時表示（省略禁止） */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <p className="text-sm md:text-base lg:text-lg text-amber-800 font-medium">{t('result.caution')}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // リストビュー
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{t('today.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
          {reversed.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">{t('today.empty')}</p>
          ) : (
            <ul>
              {reversed.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => { setSelected(item); setPanelHeight(null) }}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 text-left transition-colors"
                  >
                    <span className="text-xl shrink-0">{JUDGMENT_EMOJI[item.judgment]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.productName ?? t('unnamed')}
                      </p>
                      {item.detected.length > 0 && (
                        <p className="text-xs text-gray-500 truncate">
                          {item.detected.join(' · ')}
                        </p>
                      )}
                    </div>
                    <time
                      dateTime={item.capturedAt}
                      className="text-xs text-gray-400 shrink-0"
                    >
                      {new Date(item.capturedAt).toLocaleTimeString('ja-JP', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
