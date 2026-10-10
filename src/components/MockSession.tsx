import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Question } from '../types'
import { SECTION_LABEL } from '../data/topics'
import type { Selection } from '../lib/answer'
import { formatClock } from '../lib/date'
import {
  answerRun,
  buildMockResult,
  groupProgress,
  mockAttemptEntries,
  MOCK_SPECS,
  sectionProgress,
  startRun,
  tickRun,
  type MockBuild,
  type MockRun,
} from '../lib/mock'
import { useApp } from '../state/AppState'
import { useImmersive } from '../state/hooks'
import { useLeaveGuard } from '../state/leaveGuard'
import { useWakeLock } from '../state/wakeLock'
import { gaugeLevel } from './Controls'
import { MockResultView } from './MockResults'
import { ConfirmDialog } from './Modal'
import { QuestionView } from './QuestionView'

// 本番形式の模試を1回ぶん進める画面。
// 時間はすべて Date.now() の差で計る（画面が裏に回っても進む）。時間の進み方の本体は lib/mock.ts。

type Props = {
  build: MockBuild
  /** ×や戻るボタンで確認のうえ中断したとき（記録はしない） */
  onExit: () => void
  /** 結果画面の下に並べるボタン */
  finishActions: ReactNode
}

/** 時間切れ・区分の切り替わりのお知らせを出しておく時間（ミリ秒） */
const NOTICE_MS = 5000

export function MockSession({ build, onExit, finishActions }: Props) {
  const { questions } = build
  const spec = MOCK_SPECS[build.kind]
  const totalMs = spec.totalSec * 1000
  const { recordMock } = useApp()
  const [run, setRun] = useState<MockRun>(() => startRun(Date.now()))
  const [now, setNow] = useState(() => Date.now())
  const runRef = useRef(run)
  const recorded = useRef(false)
  const finished = run.finishedAt !== undefined

  useImmersive(!finished)
  useWakeLock(!finished)
  // 途中で戻るボタンなどで抜けようとしたときも、×ボタンと同じ確認を出す。結果画面では止めない
  const guard = useLeaveGuard(!finished, onExit)

  // 状態を進める。終了した瞬間に、1回だけ記録する（更新関数の中ではなく、ここで副作用を起こす）
  const commit = useCallback(
    (next: MockRun) => {
      if (next === runRef.current) return
      runRef.current = next
      setRun(next)
      if (next.finishedAt !== undefined && !recorded.current) {
        recorded.current = true
        recordMock(mockAttemptEntries(questions, next), buildMockResult(build.kind, questions, next))
      }
    },
    [build.kind, questions, recordMock],
  )

  useEffect(() => {
    if (finished) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      commit(tickRun(runRef.current, questions, totalMs, t))
    }
    const id = window.setInterval(tick, 250)
    // 画面が裏から戻ったとき、すぐ時計を合わせる
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [finished, commit, questions, totalMs])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [run.index, finished])

  const result = useMemo(() => (finished ? buildMockResult(build.kind, questions, run) : null), [finished, build.kind, questions, run])

  if (finished && result) {
    return <MockResultView build={build} run={run} result={result} actions={finishActions} />
  }

  const q = questions[Math.min(run.index, questions.length - 1)]
  const isLast = run.index + 1 >= questions.length

  const goNext = (selection: Selection) => {
    const t = Date.now()
    setNow(t)
    commit(answerRun(runRef.current, questions, totalMs, selection, t))
  }

  const qLimitMs = q.targetSec * 1000
  const qElapsed = Math.min(qLimitMs, Math.max(0, now - run.qStartedAt))
  const totalElapsed = Math.min(totalMs, Math.max(0, now - run.startedAt))
  const sp = sectionProgress(questions, run.index)
  const gp = groupProgress(questions, run.index)

  const notices: string[] = []
  if (now - run.qStartedAt < NOTICE_MS && run.index > 0) {
    if (run.answers[run.index - 1]?.status === 'timeout') notices.push('前の問題は時間切れになりました。')
    if (questions[run.index - 1].section !== q.section) notices.push(`ここから${SECTION_LABEL[q.section]}です。`)
  }

  return (
    <div className="session mock-session">
      <header className="mock-head">
        <div className="mock-head-row">
          <div className="session-title">{spec.label}</div>
          <div className="session-count" aria-label={`${SECTION_LABEL[sp.section]}の${sp.total}問中${sp.no}問目`}>
            {SECTION_LABEL[sp.section]} {sp.no} / {sp.total}
          </div>
          <button type="button" className="icon-btn" aria-label="模試をやめる" onClick={guard.askExit}>
            ×
          </button>
        </div>
        <div className="mock-gauges">
          <MockGauge label="この問題" elapsedMs={qElapsed} limitMs={qLimitMs} />
          <MockGauge label="全体" elapsedMs={totalElapsed} limitMs={totalMs} />
        </div>
        {notices.length > 0 && (
          <p className="mock-notice" role="status">
            {notices.join(' ')}
          </p>
        )}
      </header>

      {gp && (
        <p className="mock-group">
          <span className="chip chip-plain">
            組問題 {gp.no} / {gp.total}
          </span>
          <span className="muted small">同じ文章・表を使う問題です</span>
        </p>
      )}

      <MockQuestion key={run.index} q={q} isLast={isLast} onNext={goNext} />

      <ConfirmDialog
        open={guard.open}
        title="模試をやめますか？"
        confirmLabel="やめる"
        cancelLabel="続ける"
        danger
        onConfirm={guard.leave}
        onCancel={guard.keep}
      >
        <p>やめると、この模試のここまでの回答は記録されません。</p>
        <p className="muted small">確認しているあいだも、時間は進みます。</p>
      </ConfirmDialog>
    </div>
  )
}

// ---- 時間のゲージ ----

function MockGauge({ label, elapsedMs, limitMs }: { label: string; elapsedMs: number; limitMs: number }) {
  const ratio = limitMs > 0 ? Math.min(1, Math.max(0, elapsedMs / limitMs)) : 1
  const level = gaugeLevel(elapsedMs, limitMs / 1000)
  const leftMs = Math.max(0, limitMs - elapsedMs)
  return (
    <div className="mock-gauge">
      <span className="mock-gauge-label">{label}</span>
      <div
        className="mock-track"
        role="progressbar"
        aria-label={`${label}の経過時間`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div className={`gauge-fill lv-${level}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="mock-gauge-time">あと {formatClock(Math.ceil(leftMs / 1000) * 1000)}</span>
    </div>
  )
}

// ---- 1問 ----

function MockQuestion({ q, isLast, onNext }: { q: Question; isLast: boolean; onNext: (s: Selection) => void }) {
  const [selection, setSelection] = useState<Selection>(q.format === 'numeric' ? '' : [])
  const sent = useRef(false)
  const canSubmit = typeof selection === 'string' ? selection.trim() !== '' : selection.length > 0

  const submit = () => {
    // 二度押しで、次の問題にまで答えを送ってしまわないようにする
    if (sent.current || !canSubmit) return
    sent.current = true
    onNext(selection)
  }

  return (
    <div className="runner">
      <QuestionView question={q} selection={selection} onChange={setSelection} />
      <div className="action-bar">
        <button type="button" className="btn btn-primary btn-grow" disabled={!canSubmit} onClick={submit}>
          {isLast ? '終了する' : '次へ'}
        </button>
      </div>
    </div>
  )
}
