import { useState } from 'react'
import type { Question, Table } from '../types'
import { answerIndexes, choiceLabel, type Selection } from '../lib/answer'
import { RichText } from './RichText'

// 問題の表示（文章・表・問題文・選択肢）と、ステップごとの解説

export function DataTable({ table }: { table: Table }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        {table.caption && (
          <caption>
            <RichText text={table.caption} />
          </caption>
        )}
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i} scope="col">
                <RichText text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                // 空欄（分かっていないマス）は空白と区別できるように枠を見せる
                <td key={j} className={c === '' ? 'cell-blank' : undefined}>
                  {c === '' ? <span className="cell-blank-box" aria-label="空欄" /> : <RichText text={c} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type Props = {
  question: Question
  selection: Selection
  onChange?: (s: Selection) => void
  /** 回答後: 正解と選んだ答えの色を出し、選び直せなくする */
  reveal?: boolean
}

export function QuestionView({ question: q, selection, onChange, reveal = false }: Props) {
  const correctSet = new Set(answerIndexes(q))
  const chosen = Array.isArray(selection) ? selection : []

  const toggle = (i: number) => {
    if (reveal || !onChange) return
    if (q.format === 'multi') {
      onChange(chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i].sort((a, b) => a - b))
    } else {
      onChange([i])
    }
  }

  return (
    <div className="question">
      {q.passage && (
        <div className="passage">
          <RichText text={q.passage} />
        </div>
      )}
      {q.table && <DataTable table={q.table} />}
      <p className="stem">
        <RichText text={q.stem} />
      </p>

      {q.format === 'numeric' ? (
        <NumericAnswer
          value={typeof selection === 'string' ? selection : ''}
          onChange={(v) => onChange?.(v)}
          reveal={reveal}
          correct={String(q.answer)}
        />
      ) : (
        <>
          {q.format === 'multi' && <p className="multi-note">当てはまるものをすべて選んでください</p>}
          <div className="choices" role={q.format === 'multi' ? 'group' : 'radiogroup'} aria-label="選択肢">
            {(q.choices ?? []).map((c, i) => {
              const selected = chosen.includes(i)
              const isAnswer = correctSet.has(i)
              let state = ''
              if (reveal) state = isAnswer ? ' is-correct' : selected ? ' is-wrong' : ''
              else if (selected) state = ' is-selected'
              return (
                <button
                  key={i}
                  type="button"
                  role={q.format === 'multi' ? 'checkbox' : 'radio'}
                  aria-checked={selected}
                  className={`choice${state}${reveal ? ' is-locked' : ''}`}
                  onClick={() => toggle(i)}
                >
                  <span className="choice-label" aria-hidden="true">
                    {choiceLabel(i)}
                  </span>
                  <span className="choice-body">
                    <span className="choice-text">
                      <RichText text={c} />
                    </span>
                    {reveal && (isAnswer || selected) && (
                      <span className="choice-tags">
                        {isAnswer && <span className="tag tag-ok">正解</span>}
                        {selected && <span className={`tag ${isAnswer ? 'tag-ok-soft' : 'tag-ng'}`}>あなたの答え</span>}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function NumericAnswer({
  value,
  onChange,
  reveal,
  correct,
}: {
  value: string
  onChange: (v: string) => void
  reveal: boolean
  correct: string
}) {
  return (
    <div className="numeric">
      <label className="numeric-label" htmlFor="numeric-input">
        答えを数字で入力してください
      </label>
      <input
        id="numeric-input"
        className="input numeric-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        readOnly={reveal}
        onChange={(e) => onChange(e.target.value)}
      />
      {reveal && (
        <p className="numeric-correct">
          正解: <strong>{correct}</strong>
        </p>
      )}
    </div>
  )
}

type StepsProps = {
  steps: string[]
  /** 最初から全部開く（結果画面の見直し用） */
  showAll?: boolean
}

/** 解説をステップごとに開く。最初は1つだけ表示し、「次のステップ」で1つずつ、「全部表示」で残りを開く */
export function Steps({ steps, showAll = false }: StepsProps) {
  const [shown, setShown] = useState(showAll ? steps.length : Math.min(1, steps.length))
  const done = shown >= steps.length
  return (
    <div className="steps">
      <ol className="step-list">
        {steps.slice(0, shown).map((s, i) => (
          <li key={i} className={`step${i === steps.length - 1 ? ' is-last' : ''}`}>
            <span className="step-no" aria-hidden="true">
              {i + 1}
            </span>
            <span className="step-text">
              <RichText text={s} />
            </span>
          </li>
        ))}
      </ol>
      {!done && (
        <div className="step-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShown((n) => n + 1)}>
            次のステップ（{shown} / {steps.length}）
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShown(steps.length)}>
            全部表示
          </button>
        </div>
      )}
    </div>
  )
}
