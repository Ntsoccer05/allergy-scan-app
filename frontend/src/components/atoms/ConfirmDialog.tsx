'use client'

type Props = {
  message: string
  confirmLabel: string
  cancelLabel: string
  /** true にすると確定ボタンを赤系にする。 */
  isDanger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** window.confirm の代替となるモーダル確認ダイアログ。 */
export function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  isDanger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <p className="text-sm text-gray-800 whitespace-pre-line">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-xl text-sm font-medium text-white transition-colors ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
