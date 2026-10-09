import { useId, useState } from 'react'
import { useApp } from '../state/AppState'

/** 「この問題おかしい？」: 気になった問題を、任意のメモつきで記録する */
export function FlagBox({ questionKey }: { questionKey: string }) {
  const { data, addFlag, removeFlag } = useApp()
  const [open, setOpen] = useState(false)
  const [memo, setMemo] = useState('')
  const id = useId()
  const flagged = data.flags.some((f) => f.questionKey === questionKey)

  if (flagged) {
    return (
      <p className="flag-done">
        「おかしい」として記録しました（設定から一覧を見られます）。{' '}
        <button type="button" className="link-btn" onClick={() => removeFlag(questionKey)}>
          取り消す
        </button>
      </p>
    )
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        この問題おかしい？
      </button>
    )
  }
  return (
    <div className="flag-form">
      <label htmlFor={id} className="field-label">
        どこがおかしいと思いましたか（書かなくても記録できます）
      </label>
      <textarea
        id={id}
        className="input"
        rows={3}
        value={memo}
        maxLength={500}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="例: 正解が2つあるように見える"
      />
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            addFlag(questionKey, memo)
            setOpen(false)
            setMemo('')
          }}
        >
          記録する
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </div>
  )
}
