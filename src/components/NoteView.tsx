import { useMemo, useRef, useState } from 'react'
import type { Note, NoteExample } from '../types'
import { validateNote } from '../lib/validate'
import { RichText } from './RichText'
import { FigureView, TableFigure } from './figures/FigureView'
import '../styles/note.css'

// 解き方ノートの表示（ノートのページと、ドリル中のシートで共通）。
// 形は src/types.ts の Note。書き方は docs/ノートの書き方.md。
// 古い形のノートや、検査（validateNote）を通らないノートは「このノートは準備中です」と出して落ちない。

/** 画面に出せるノートか（形の検査を通るか）。検査中に例外が出ても false にする */
export function isNoteReady(note: Note | null | undefined): note is Note {
  if (!note || typeof note !== 'object') return false
  try {
    const errors = validateNote(note)
    if (errors.length > 0 && import.meta.env.DEV && typeof window !== 'undefined') {
      console.warn(`ノートを表示できません(${String(note.topic)}):`, errors.slice(0, 5))
    }
    return errors.length === 0
  } catch {
    return false
  }
}

/** 「。」で区切って 1文ずつの行にする（閉じかっこの前では区切らない）。長い説明を読みやすくするため */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    cur += ch
    if (ch === '。') {
      const next = text[i + 1]
      if (next === undefined || !'」』）)'.includes(next)) {
        out.push(cur)
        cur = ''
      }
    }
  }
  if (cur.trim() !== '') out.push(cur)
  return out.map((s) => s.trim()).filter((s) => s !== '')
}

/** 「答え: 12g」のように前置きが付いていたら外す（画面で「答え」の札を付けるため） */
function stripAnswerPrefix(a: string): string {
  return a.replace(/^\s*答え?\s*[:：]\s*/, '')
}

function Bulb() {
  return (
    <svg
      className="nt-tip-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 18h6" />
      <path d="M10 21.5h4" />
      <path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.2.9 1.9V16h6v-.1c0-.7.3-1.4.9-1.9A6.5 6.5 0 0 0 12 2.5z" />
    </svg>
  )
}

function ExampleView({ ex }: { ex: NoteExample }) {
  return (
    <>
      <div className="nt-ex">
        <span className="nt-tag nt-tag-ex">例題</span>
        <p className="nt-stem">
          <RichText text={ex.stem} />
        </p>
        {ex.table && (
          <figure className="fg fg-table">
            <TableFigure table={ex.table} />
          </figure>
        )}
        {ex.figure && <FigureView figure={ex.figure} />}
      </div>

      <div className="nt-steps-wrap">
        <h3 className="nt-steps-h">解き方</h3>
        <ol className="nt-steps">
          {ex.steps.map((s, i) => (
            <li key={i} className="nt-step">
              <span className="nt-no" aria-hidden="true">
                {i + 1}
              </span>
              <div className="nt-step-body">
                <p className="nt-step-text">
                  <RichText text={s.text} />
                </p>
                {s.calc && (
                  <p className="nt-calc">
                    <RichText text={s.calc} />
                  </p>
                )}
                {s.figure && <FigureView figure={s.figure} />}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="nt-ans">
        <span className="nt-ans-tag">答え</span>
        <span className="nt-ans-text">
          <RichText text={stripAnswerPrefix(ex.answer)} />
        </span>
      </div>
    </>
  )
}

type TocItem = { id: string; label: string }

function NoteBody({ note }: { note: Note }) {
  const { formulas, patterns, pitfalls } = note
  // 型カードの開閉。最初の1つだけ開いておく
  const [open, setOpen] = useState<boolean[]>(() => patterns.map((_, i) => i === 0))
  const nodes = useRef(new Map<string, HTMLElement>())
  const reg = (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el)
    else nodes.current.delete(id)
  }

  const toc: TocItem[] = [
    { id: 'summary', label: '聞かれること' },
    { id: 'keypoints', label: '覚えること' },
    ...(formulas.length > 0 ? [{ id: 'formulas', label: '公式' }] : []),
    ...patterns.map((_, i) => ({ id: `p${i}`, label: `型${i + 1}` })),
    { id: 'pitfalls', label: 'よくある間違い' },
  ]

  const allOpen = patterns.every((_, i) => open[i])
  const setAll = (v: boolean) => setOpen(patterns.map(() => v))
  const setOne = (i: number, v: boolean) =>
    setOpen((o) => {
      if ((o[i] ?? false) === v) return o
      const next = patterns.map((_, k) => o[k] ?? false)
      next[i] = v
      return next
    })

  // 目次から飛ぶ。ページでもシート(中でスクロールする画面)でも動くよう scrollIntoView を使う
  // (ハッシュルーターなので、#見出し のリンクは使えない)
  const jump = (id: string) => {
    const m = /^p(\d+)$/.exec(id)
    if (m) setOne(Number(m[1]), true)
    let smooth = true
    try {
      smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      // matchMedia が使えない環境ではそのまま動かす
    }
    requestAnimationFrame(() => {
      nodes.current.get(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
    })
  }

  return (
    <article className="nt">
      <nav className="nt-toc" aria-label="ノートの目次">
        <div className="nt-toc-list">
          {toc.map((t) => (
            <button key={t.id} type="button" className="nt-chip" onClick={() => jump(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="nt-sec" ref={reg('summary')}>
        <div className="nt-sum">
          <h2 className="nt-sum-label">この分野で聞かれること</h2>
          <p className="nt-sum-text">
            {splitSentences(note.summary).map((s, i) => (
              <span key={i} className="nt-sent">
                <RichText text={s} />
              </span>
            ))}
          </p>
        </div>
      </section>

      <section className="nt-sec" ref={reg('keypoints')}>
        <h2 className="nt-h">まず覚えること</h2>
        <ol className="nt-kp">
          {note.keyPoints.map((k, i) => (
            <li key={i}>
              <span className="nt-no" aria-hidden="true">
                {i + 1}
              </span>
              <span className="nt-kp-text">
                <RichText text={k} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      {formulas.length > 0 && (
        <section className="nt-sec" ref={reg('formulas')}>
          <h2 className="nt-h">公式</h2>
          <ul className="nt-fm-list">
            {formulas.map((f, i) => (
              <li key={i} className="nt-fm">
                <div className="nt-fm-label">
                  <RichText text={f.label} />
                </div>
                <div className="nt-fm-body">
                  <RichText text={f.body} />
                </div>
                <div className="nt-fm-ex">
                  <span className="nt-badge">例</span>
                  <span className="nt-fm-ex-text">
                    <RichText text={f.example} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="nt-sec">
        <div className="nt-h-row">
          <h2 className="nt-h">型ごとの解き方</h2>
          <button type="button" className="nt-btn" onClick={() => setAll(!allOpen)}>
            {allOpen ? 'すべて閉じる' : 'すべて開く'}
          </button>
        </div>
        <div className="nt-pats">
          {patterns.map((p, i) => (
            <details
              key={i}
              className="nt-pat"
              open={open[i] ?? false}
              onToggle={(e) => setOne(i, e.currentTarget.open)}
              ref={reg(`p${i}`)}
            >
              <summary className="nt-pat-sum">
                <span className="nt-pat-band">
                  <span className="nt-pat-no">型{i + 1}</span>
                  <span className="nt-pat-title">
                    <RichText text={p.title} />
                  </span>
                  <span className="nt-chev" aria-hidden="true" />
                </span>
                <span className="nt-pat-lead">
                  <RichText text={p.lead} />
                </span>
              </summary>
              <div className="nt-pat-body">
                <ExampleView ex={p.example} />
                {p.point && (
                  <div className="nt-tip">
                    <Bulb />
                    <div className="nt-tip-main">
                      <span className="nt-tip-label">コツ</span>
                      <p className="nt-tip-text">
                        <RichText text={p.point} />
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="nt-sec" ref={reg('pitfalls')}>
        <h2 className="nt-h">よくある間違い</h2>
        <ul className="nt-pit-list">
          {pitfalls.map((p, i) => (
            <li key={i} className="nt-pit">
              <div className="nt-pit-row is-ng">
                <span className="nt-mark" aria-hidden="true">
                  ✗
                </span>
                <div>
                  <span className="nt-pit-tag">間違い</span>
                  <p className="nt-pit-text">
                    <RichText text={p.wrong} />
                  </p>
                </div>
              </div>
              <div className="nt-pit-row is-ok">
                <span className="nt-mark" aria-hidden="true">
                  ○
                </span>
                <div>
                  <span className="nt-pit-tag">正しくは</span>
                  <p className="nt-pit-text">
                    <RichText text={p.right} />
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}

/** ノートがない・形が合わないときの表示 */
export function NoteNotReady() {
  return (
    <div className="nt-empty">
      <p>このノートは準備中です。</p>
    </div>
  )
}

export function NoteView({ note }: { note?: Note | null }) {
  const ready = useMemo(() => isNoteReady(note), [note])
  if (!ready || !note) return <NoteNotReady />
  return <NoteBody note={note} />
}
