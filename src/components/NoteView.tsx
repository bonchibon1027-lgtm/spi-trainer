import type { Note, Table } from '../types'
import { RichText } from './RichText'
import { DataTable } from './QuestionView'

// 解き方ノートの表示（ノートのページと、ドリル中のシートで共通）

function answerText(a: string): string {
  return /^答/.test(a.trim()) ? a : `答え: ${a}`
}

function Example({ index, stem, table, steps, answer }: { index: number; stem: string; table?: Table; steps: string[]; answer: string }) {
  return (
    <div className="note-card">
      <h4 className="note-card-title">例題{index + 1}</h4>
      <p className="note-stem">
        <RichText text={stem} />
      </p>
      {table && <DataTable table={table} />}
      <details className="note-details">
        <summary>解き方を見る</summary>
        <ol className="note-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <RichText text={s} />
            </li>
          ))}
        </ol>
        <p className="note-answer">
          <RichText text={answerText(answer)} />
        </p>
      </details>
    </div>
  )
}

export function NoteView({ note }: { note: Note }) {
  const formulas = note.formulas ?? []
  const patterns = note.patterns ?? []
  const examples = note.examples ?? []
  const pitfalls = note.pitfalls ?? []
  return (
    <article className="note">
      <section className="note-section">
        <h3 className="note-h">この分野で聞かれること</h3>
        <p className="note-summary">
          <RichText text={note.summary} />
        </p>
      </section>

      {formulas.length > 0 && (
        <section className="note-section">
          <h3 className="note-h">覚える公式</h3>
          <ul className="formula-list">
            {formulas.map((f, i) => (
              <li key={i} className="formula">
                <div className="formula-label">
                  <RichText text={f.label} />
                </div>
                <div className="formula-body">
                  <RichText text={f.body} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {patterns.length > 0 && (
        <section className="note-section">
          <h3 className="note-h">型と解き方</h3>
          {patterns.map((p, i) => (
            <div key={i} className="note-card">
              <h4 className="note-card-title">
                <RichText text={p.title} />
              </h4>
              <ol className="note-steps">
                {p.steps.map((s, j) => (
                  <li key={j}>
                    <RichText text={s} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      {examples.length > 0 && (
        <section className="note-section">
          <h3 className="note-h">例題</h3>
          {examples.map((e, i) => (
            <Example key={i} index={i} stem={e.stem} table={e.table} steps={e.steps} answer={e.answer} />
          ))}
        </section>
      )}

      {pitfalls.length > 0 && (
        <section className="note-section">
          <h3 className="note-h">よくある間違い</h3>
          <ul className="pitfall-list">
            {pitfalls.map((s, i) => (
              <li key={i}>
                <RichText text={s} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
