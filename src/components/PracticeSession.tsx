import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AttemptMode, Question } from '../types'
import { getTopic } from '../data/topics'
import { getNote } from '../content'
import { isCorrect, type Selection } from '../lib/answer'
import { formatMs } from '../lib/date'
import { needsReview } from '../lib/review'
import { clip } from '../lib/text'
import { useApp } from '../state/AppState'
import { useImmersive } from '../state/hooks'
import { ConfirmDialog, Sheet } from './Modal'
import { FlagBox } from './FlagBox'
import { NoteView } from './NoteView'
import { QuestionView, Steps } from './QuestionView'
import { RichText } from './RichText'
import { TimeGauge } from './Controls'

// ドリルと復習で共通の「1問ずつ解く」画面。

export type SessionItem = {
  question: Question
  /** 復習のとき: 復習リストの項目のキー（stage 1 以降は解く問題とキーが違う） */
  reviewKey?: string
}

export type SessionResult = {
  question: Question
  correct: boolean
  usedHint: boolean
  timeMs: number
  selection: Selection
}

type Props = {
  title: string
  mode: AttemptMode
  items: SessionItem[]
  /** ×で確認のうえ終了したとき */
  onExit: () => void
  /** 終了画面の下に並べるボタン */
  finishActions: ReactNode
}

export function PracticeSession({ title, mode, items, onExit, finishActions }: Props) {
  useImmersive()
  const { recordAnswer } = useApp()
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<SessionResult[]>([])
  const [finished, setFinished] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [index, finished])

  if (items.length === 0) return null

  if (finished) {
    return <SessionSummary title={title} mode={mode} results={results} actions={finishActions} />
  }

  const item = items[index]
  const isLast = index + 1 >= items.length

  const handleAnswered = (r: SessionResult) => {
    recordAnswer(r.question, mode, { correct: r.correct, usedHint: r.usedHint, timeMs: r.timeMs }, item.reviewKey)
    setResults((prev) => [...prev, r])
  }

  return (
    <div className="session">
      <header className="session-head">
        <div className="session-title">{title}</div>
        <div className="session-count" aria-label={`${items.length}問中${index + 1}問目`}>
          {index + 1} / {items.length}
        </div>
        <button type="button" className="icon-btn" aria-label="練習をやめる" onClick={() => setConfirmExit(true)}>
          ×
        </button>
      </header>

      <QuestionRunner
        key={`${index}:${item.question.key}`}
        item={item}
        mode={mode}
        isLast={isLast}
        onAnswered={handleAnswered}
        onNext={() => (isLast ? setFinished(true) : setIndex((i) => i + 1))}
      />

      <ConfirmDialog
        open={confirmExit}
        title="練習をやめますか？"
        confirmLabel="やめる"
        cancelLabel="続ける"
        danger
        onConfirm={() => {
          setConfirmExit(false)
          onExit()
        }}
        onCancel={() => setConfirmExit(false)}
      >
        <p>回答した問題の結果は、もう記録されています。今の問題はまだ記録されません。</p>
      </ConfirmDialog>
    </div>
  )
}

// ---- 1問 ----

type RunnerProps = {
  item: SessionItem
  mode: AttemptMode
  isLast: boolean
  onAnswered: (r: SessionResult) => void
  onNext: () => void
}

function QuestionRunner({ item, mode, isLast, onAnswered, onNext }: RunnerProps) {
  const q = item.question
  const [selection, setSelection] = useState<Selection>(q.format === 'numeric' ? '' : [])
  const [hintShown, setHintShown] = useState(false)
  const [answered, setAnswered] = useState<{ correct: boolean; timeMs: number } | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  // 時間は「問題を表示してから回答ボタンを押すまで」。解説を読む時間は含めない
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const submitted = useRef(false)
  const hintRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (answered) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [answered])

  useEffect(() => {
    if (hintShown) hintRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [hintShown])

  const elapsed = answered ? answered.timeMs : Math.max(0, now - startedAt)
  const canSubmit = typeof selection === 'string' ? selection.trim() !== '' : selection.length > 0

  const submit = () => {
    if (submitted.current || !canSubmit) return
    submitted.current = true
    const timeMs = Date.now() - startedAt
    const correct = isCorrect(q, selection)
    setAnswered({ correct, timeMs })
    onAnswered({ question: q, correct, usedHint: hintShown, timeMs, selection })
  }

  const note = getNote(q.topic)
  const topicName = getTopic(q.topic).name
  const over = answered ? answered.timeMs > q.targetSec * 1000 : false
  const needs = answered
    ? needsReview({ correct: answered.correct, usedHint: hintShown, timeMs: answered.timeMs, targetSec: q.targetSec })
    : false

  return (
    <div className="runner">
      <TimeGauge elapsedMs={elapsed} targetSec={q.targetSec} frozen={answered !== null} />

      <QuestionView question={q} selection={selection} onChange={setSelection} reveal={answered !== null} />

      {hintShown && q.hint && !answered && (
        <div ref={hintRef} className="callout callout-hint">
          <strong className="callout-title">ヒント</strong>
          <p>
            <RichText text={q.hint} />
          </p>
        </div>
      )}

      {answered && (
        <section className="answered" aria-live="polite">
          <div className={`feedback ${answered.correct ? 'is-ok' : 'is-ng'}`} role="status">
            <div className="feedback-main">
              <span className="feedback-mark" aria-hidden="true">
                {answered.correct ? '○' : '×'}
              </span>
              <span>{answered.correct ? '正解です' : '不正解です'}</span>
            </div>
            <div className="feedback-badges">
              <span className="badge">かかった時間 {formatMs(answered.timeMs)}</span>
              {hintShown && <span className="badge badge-warn">ヒントを使いました</span>}
              {over && <span className="badge badge-warn">目安時間をオーバー</span>}
            </div>
            <p className="feedback-note">
              {mode === 'review'
                ? needs
                  ? 'もう一度、明日の復習に出ます。'
                  : 'よくできました。この問題は次の間隔の復習に進みます。'
                : needs
                  ? '復習リストに入りました。明日から出ます。'
                  : 'この調子です。'}
            </p>
          </div>

          <h3 className="section-h">解説</h3>
          <Steps steps={q.explanation} />

          <div className="answered-tools">
            <button type="button" className="btn btn-secondary" onClick={() => setNoteOpen(true)}>
              解き方ノートを見る
            </button>
            <FlagBox questionKey={q.key} />
          </div>
        </section>
      )}

      <div className="action-bar">
        {!answered ? (
          <>
            {q.hint && !hintShown && (
              <button type="button" className="btn btn-secondary" onClick={() => setHintShown(true)}>
                ヒント
              </button>
            )}
            <button type="button" className="btn btn-primary btn-grow" disabled={!canSubmit} onClick={submit}>
              回答する
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-grow" onClick={onNext}>
            {isLast ? '結果を見る' : '次の問題へ'}
          </button>
        )}
      </div>

      <Sheet open={noteOpen} title={`${topicName}の解き方ノート`} onClose={() => setNoteOpen(false)}>
        {note ? <NoteView note={note} /> : <p>この分野のノートは準備中です。</p>}
      </Sheet>
    </div>
  )
}

// ---- 終了画面 ----

export function SessionSummary({ title, mode, results, actions }: { title: string; mode: AttemptMode; results: SessionResult[]; actions: ReactNode }) {
  const total = results.length
  const correctN = results.filter((r) => r.correct).length
  const totalMs = results.reduce((s, r) => s + r.timeMs, 0)
  const again = results.filter((r) =>
    needsReview({ correct: r.correct, usedHint: r.usedHint, timeMs: r.timeMs, targetSec: r.question.targetSec }),
  ).length

  return (
    <div className="session">
      <header className="session-head">
        <div className="session-title">{title}</div>
        <div className="session-count">結果</div>
      </header>

      <section className="score-card">
        <div className="score-main">
          <span className="score-num">{correctN}</span>
          <span className="score-den"> / {total}問 正解</span>
        </div>
        <p className="score-sub">
          合計 {formatMs(totalMs)}（1問あたり平均 {formatMs(total ? totalMs / total : 0)}）
        </p>
        <p className="score-sub">
          {mode === 'review'
            ? `もう一度復習になる問題: ${again}問 ／ 次へ進んだ問題: ${total - again}問`
            : again > 0
              ? `復習リストに入った問題: ${again}問（明日から出ます）`
              : '復習リストに入る問題はありません'}
        </p>
      </section>

      <h3 className="section-h">問題ごとの結果</h3>
      <p className="muted">タップすると、問題と解説を見直せます。</p>
      <ul className="result-list">
        {results.map((r, i) => (
          <SessionResultRow key={`${i}:${r.question.key}`} r={r} no={i + 1} />
        ))}
      </ul>

      <div className="finish-actions">{actions}</div>
    </div>
  )
}

function SessionResultRow({ r, no }: { r: SessionResult; no: number }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="result-row">
      <button type="button" className="result-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`result-mark ${r.correct ? 'is-ok' : 'is-ng'}`}>
          <span aria-hidden="true">{r.correct ? '○' : '×'}</span>
          <span className="sr-only">{r.correct ? '正解' : '不正解'}</span>
        </span>
        <span className="result-no">問{no}</span>
        <span className="result-stem">{clip(r.question.stem, 40)}</span>
        <span className="result-time">{formatMs(r.timeMs)}</span>
      </button>
      {open && (
        <div className="result-body">
          <QuestionView question={r.question} selection={r.selection} reveal />
          <h4 className="section-h">解説</h4>
          <Steps steps={r.question.explanation} showAll />
        </div>
      )}
    </li>
  )
}
