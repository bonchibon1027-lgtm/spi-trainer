import type { ReactNode } from 'react'
import { STATUS_LABEL, type TopicStatus } from '../lib/stats'
import { formatClock, formatSec } from '../lib/date'

// 小さな部品: 切り替えボタン、状態チップ、時間ゲージ

type SegmentedProps<T extends string | number> = {
  label: string
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`segment${o.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function StatusChip({ status }: { status: TopicStatus }) {
  return <span className={`chip chip-${status}`}>{STATUS_LABEL[status]}</span>
}

export type GaugeLevel = 'ok' | 'warn' | 'alert' | 'over'

/** 経過時間 / 目安: 50%未満 緑 → 75%未満 黄 → 100%未満 オレンジ → 100%以上 赤 */
export function gaugeLevel(elapsedMs: number, targetSec: number): GaugeLevel {
  const r = elapsedMs / (targetSec * 1000)
  if (r < 0.5) return 'ok'
  if (r < 0.75) return 'warn'
  if (r < 1) return 'alert'
  return 'over'
}

export function TimeGauge({ elapsedMs, targetSec, frozen = false }: { elapsedMs: number; targetSec: number; frozen?: boolean }) {
  const ratio = Math.max(0, elapsedMs / (targetSec * 1000))
  const level = gaugeLevel(elapsedMs, targetSec)
  return (
    <div className="gauge">
      <div
        className="gauge-track"
        role="progressbar"
        aria-label="経過時間"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(ratio * 100))}
      >
        <div className={`gauge-fill lv-${level}`} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
      </div>
      <div className="gauge-text">
        <span>
          {frozen ? 'かかった時間' : '経過'} {formatClock(elapsedMs)}
        </span>
        {level === 'over' && <span className="gauge-over">目安を過ぎました</span>}
        <span>目安 {formatSec(targetSec)}</span>
      </div>
    </div>
  )
}
