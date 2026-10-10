import { useState, type ReactNode } from 'react'
import { SECTION_LABEL, TOPICS } from '../data/topics'
import { formatMs, formatSec } from '../lib/date'
import {
  groupProgress,
  MOCK_SPECS,
  mockAccuracy,
  outcomeOf,
  type MockAnswer,
  type MockBuild,
  type MockOutcome,
  type MockResult,
  type MockRun,
  type Tally,
} from '../lib/mock'
import { clip } from '../lib/text'
import type { Question, Section } from '../types'
import { QuestionView, Steps } from './QuestionView'

// 模試の結果画面。正答率はアプリ独自の目安で、本番の評価（段階・偏差値）とは別物。

export const MOCK_DISCLAIMER = 'この点数は、このアプリ独自の目安です。本番の評価（段階・偏差値）とは別物です。'

const pct = (t: Pick<Tally, 'total' | 'correct'>) => Math.round(mockAccuracy(t) * 100)

type Props = {
  build: MockBuild
  run: MockRun
  result: MockResult
  actions: ReactNode
}

export function MockResultView({ build, run, result, actions }: Props) {
  const spec = MOCK_SPECS[build.kind]
  const wrongCount = result.total - result.correct - result.unanswered // 間違い + 時間切れ
  const topicRows = TOPICS.filter((t) => result.byTopic[t.id])

  return (
    <div className="session">
      <header className="session-head">
        <div className="session-title">{spec.label}</div>
        <div className="session-count">結果</div>
      </header>

      <section className="score-card" aria-label="全体の結果">
        <div className="score-main">
          <span className="score-num">{result.correct}</span>
          <span className="score-den"> / {result.total}問 正解</span>
        </div>
        <p className="score-sub">
          正答率 <strong>{pct(result)}%</strong>
        </p>
        <p className="score-sub">
          かかった時間 {formatSec(result.durationSec)}（制限時間 {spec.minutes}分）
        </p>
        <p className="score-sub">
          {wrongCount > 0 ? `復習リストに入った問題: ${wrongCount}問（明日から出ます）` : '復習リストに入る問題はありません'}
        </p>
      </section>

      <p className="mock-note">{MOCK_DISCLAIMER}</p>

      <section className="card" aria-label="内訳">
        <dl className="stat-grid">
          <SectionStat section="verbal" tally={result.bySection.verbal} />
          <SectionStat section="nonverbal" tally={result.bySection.nonverbal} />
          <div>
            <dt>時間切れ</dt>
            <dd>{result.timeouts}問</dd>
          </div>
          <div>
            <dt>未回答（全体の時間切れ）</dt>
            <dd>{result.unanswered}問</dd>
          </div>
        </dl>
        {result.timeouts > 0 && (
          <p className="muted small">時間切れの問題は、答えていないので不正解として数えています。</p>
        )}
        {result.unanswered > 0 && (
          <p className="muted small">全体の時間が切れて解けなかった問題は、不正解にも復習にも入れていません。</p>
        )}
      </section>

      <section aria-label="分野ごとの結果">
        <h3 className="section-h">分野ごとの結果</h3>
        <ul className="stat-list mock-topics">
          {topicRows.map((t) => {
            const tally = result.byTopic[t.id]!
            const p = pct(tally)
            const status = p >= 80 ? 'strong' : p < 60 ? 'weak' : 'practicing'
            return (
              <li key={t.id} className="stat-row">
                <div className="stat-head">
                  <span className="stat-name">{t.name}</span>
                  <span className="stat-meta">
                    {tally.correct} / {tally.total}問
                  </span>
                </div>
                <div className="bar" role="img" aria-label={`${t.name}: ${tally.total}問中${tally.correct}問正解`}>
                  <div className={`bar-fill st-${status}`} style={{ width: `${p}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <h3 className="section-h">問題ごとの結果</h3>
      <p className="muted">タップすると、問題と解説を見直せます。</p>
      <ul className="result-list">
        {build.questions.map((q, i) => (
          <MockResultRow
            key={`${i}:${q.key}`}
            no={i + 1}
            question={q}
            answer={run.answers[i] ?? { status: 'unanswered' }}
            group={groupProgress(build.questions, i)}
          />
        ))}
      </ul>

      <div className="finish-actions">{actions}</div>
    </div>
  )
}

function SectionStat({ section, tally }: { section: Section; tally: Tally }) {
  return (
    <div>
      <dt>{SECTION_LABEL[section]}</dt>
      <dd>
        {tally.correct} / {tally.total}問
      </dd>
      <dd className="mock-stat-sub">{tally.total > 0 ? `正答率 ${pct(tally)}%` : '出題なし'}</dd>
    </div>
  )
}

const MARK: Record<MockOutcome, { text: string; cls: string; label: string }> = {
  correct: { text: '○', cls: 'is-ok', label: '正解' },
  wrong: { text: '×', cls: 'is-ng', label: '不正解' },
  timeout: { text: '×', cls: 'is-ng', label: '時間切れ' },
  unanswered: { text: '－', cls: 'is-none', label: '未回答' },
}

function MockResultRow({
  no,
  question: q,
  answer,
  group,
}: {
  no: number
  question: Question
  answer: MockAnswer
  group: { no: number; total: number } | null
}) {
  const [open, setOpen] = useState(false)
  const outcome = outcomeOf(answer)
  const mark = MARK[outcome]
  const selection = answer.status === 'answered' ? answer.selection : q.format === 'numeric' ? '' : []
  return (
    <li className="result-row">
      <button type="button" className="result-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`result-mark ${mark.cls}`}>
          <span aria-hidden="true">{mark.text}</span>
          <span className="sr-only">{mark.label}</span>
        </span>
        <span className="result-no">問{no}</span>
        <span className="result-stem">{clip(q.stem, 40)}</span>
        {outcome === 'timeout' || outcome === 'unanswered' ? (
          <span className="badge badge-warn mock-result-badge">{mark.label}</span>
        ) : (
          <span className="result-time">{answer.status === 'answered' ? formatMs(answer.timeMs) : ''}</span>
        )}
      </button>
      {open && (
        <div className="result-body">
          <p className="muted small">
            {SECTION_LABEL[q.section]}・{TOPICS.find((t) => t.id === q.topic)?.name}
            {group && `・組問題 ${group.no} / ${group.total}`}
          </p>
          {outcome === 'timeout' && <p className="mock-result-note">制限時間内に答えられなかったので、不正解です。</p>}
          {outcome === 'unanswered' && <p className="mock-result-note">全体の時間が切れて、解けませんでした（記録には入れていません）。</p>}
          <QuestionView question={q} selection={selection} reveal />
          <h4 className="section-h">解説</h4>
          <Steps steps={q.explanation} showAll />
        </div>
      )}
    </li>
  )
}
