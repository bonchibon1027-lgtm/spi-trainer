import { useEffect, useRef, type ReactNode } from 'react'
import { useEscape, useLockScroll } from '../state/hooks'

// 確認ダイアログと、下から出るシート（ドリルの途中でノートを見る用）

type ConfirmProps = {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 取り消せない操作のとき赤いボタンにする */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const ref = useRef<HTMLDivElement>(null)
  useLockScroll(open)
  useEscape(open, onCancel)
  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])
  if (!open) return null
  return (
    <div className="overlay overlay-center" onClick={onCancel}>
      <div
        ref={ref}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">{title}</h2>
        {children && <div className="dialog-body">{children}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

type SheetProps = {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}

export function Sheet({ open, title, children, onClose }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null)
  useLockScroll(open)
  useEscape(open, onClose)
  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])
  if (!open) return null
  return (
    <div className="overlay overlay-bottom" onClick={onClose}>
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
