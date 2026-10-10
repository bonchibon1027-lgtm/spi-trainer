import { describe, expect, it } from 'vitest'
import rawQuestions from './questions/vb-order.json'
import rawNote from './notes/vb-order.json'
import type { AuthoredQuestion, Note } from '../types'

// 文の並べ替え（vb-order）の検証。
// 各問題の解説に書かれた「正しい順: イ→ウ→…」を読み取り、問題文の【◯番目】に来る記号が、
// 正解（choices[answer]）と一致することを確かめる。
// 語句の並べ替えは、問題文の前後の文字と語句をつなげた文が、解説の「完成した文」と同じことも確かめる。

const questions = rawQuestions as unknown as AuthoredQuestion[]
const note = rawNote as unknown as Note

const SYMBOLS = ['ア', 'イ', 'ウ', 'エ', 'オ']
const ORDER_RE = /正しい順:\s*([ア-オ](?:→[ア-オ]){4})/
const ASK_RE = /【(\d)番目】/
const BLANKS = '（　）（　）（　）（　）（　）'

type Parsed = {
  askedPos: number
  items: Record<string, string>
  order: string[]
  completed?: string
}

function parse(q: AuthoredQuestion): Parsed {
  const ask = ASK_RE.exec(q.stem)
  expect(ask, `${q.key} に【◯番目】がある`).not.toBeNull()
  const items: Record<string, string> = {}
  for (const line of q.stem.split('\n')) {
    const m = /^([ア-オ])　(.+)$/.exec(line)
    if (m) items[m[1]] = m[2]
  }
  const joined = q.explanation.join('\n')
  const om = ORDER_RE.exec(joined)
  expect(om, `${q.key} の解説に「正しい順: …」がある`).not.toBeNull()
  const cm = /完成した文:\s*(.+)/.exec(joined)
  return {
    askedPos: Number(ask![1]),
    items,
    order: om![1].split('→'),
    completed: cm?.[1],
  }
}

describe('vb-order 問題データ', () => {
  it('20問・12問と8問の内訳', () => {
    expect(questions).toHaveLength(20)
    const word = questions.filter((q) => q.stem.includes(BLANKS))
    const sentence = questions.filter((q) => !q.stem.includes(BLANKS))
    expect(word).toHaveLength(12)
    expect(sentence).toHaveLength(8)
  })

  it('choices は ア〜オ の順で、single 形式', () => {
    for (const q of questions) {
      expect(q.format, q.key).toBe('single')
      expect(q.choices, q.key).toEqual(SYMBOLS)
    }
  })

  it('正しい順に ア〜オ がちょうど1回ずつ出る', () => {
    for (const q of questions) {
      const { order } = parse(q)
      expect([...order].sort(), q.key).toEqual([...SYMBOLS].sort())
    }
  })

  it('問題文に ア〜オ の5つの項目がそろっている', () => {
    for (const q of questions) {
      const { items } = parse(q)
      expect(Object.keys(items).sort(), q.key).toEqual([...SYMBOLS].sort())
      expect(new Set(Object.values(items)).size, `${q.key} の項目が重複`).toBe(5)
    }
  })

  it('【◯番目】の位置にある記号が、正解と一致する', () => {
    for (const q of questions) {
      const { askedPos, order } = parse(q)
      expect(askedPos, q.key).toBeGreaterThanOrEqual(1)
      expect(askedPos, q.key).toBeLessThanOrEqual(5)
      expect(order[askedPos - 1], q.key).toBe(q.choices![q.answer as number])
    }
  })

  it('解説の最後が「答え: 記号」で、正解の記号と一致する', () => {
    for (const q of questions) {
      const last = q.explanation[q.explanation.length - 1]
      expect(last, q.key).toContain(`答え: ${q.choices![q.answer as number]}`)
    }
  })

  it('語句の並べ替え: 前後の文字と語句をつなげた文が、解説の「完成した文」と同じ', () => {
    for (const q of questions.filter((x) => x.stem.includes(BLANKS))) {
      const { items, order, completed } = parse(q)
      const line = q.stem.split('\n').find((l) => l.includes(BLANKS))!
      const [prefix, suffix] = line.split(BLANKS)
      const built = prefix + order.map((s) => items[s]).join('') + suffix
      expect(completed, q.key).toBe(built)
      // 空欄は5つだけ
      expect(line.split('（　）').length - 1, q.key).toBe(5)
    }
  })

  it('文章の並べ替え: 正しい順に並べた文が「，」「。」で自然に終わる', () => {
    for (const q of questions.filter((x) => !x.stem.includes(BLANKS))) {
      const { items, order } = parse(q)
      for (const s of order) expect(items[s].endsWith('。'), `${q.key} ${s}`).toBe(true)
    }
  })

  it('聞く番目と、正解の記号がかたよらない', () => {
    const asked = new Array(5).fill(0)
    const ans = new Array(5).fill(0)
    for (const q of questions) {
      asked[parse(q).askedPos - 1]++
      ans[q.answer as number]++
    }
    for (const c of asked) expect(c).toBeGreaterThanOrEqual(2)
    for (const c of asked) expect(c).toBeLessThanOrEqual(6)
    for (const c of ans) expect(c).toBeGreaterThanOrEqual(3)
    for (const c of ans) expect(c).toBeLessThanOrEqual(5)
  })

  it('難易度の内訳', () => {
    const n = [1, 2, 3].map((d) => questions.filter((q) => q.difficulty === d).length)
    expect(n[0]).toBeGreaterThanOrEqual(5)
    expect(n[1]).toBeGreaterThanOrEqual(6)
    expect(n[2]).toBeGreaterThanOrEqual(3)
  })

  it('手がかりの解説で、正しい順より前の記号の使い方が矛盾していない（解説中の矢印の連なりが正しい順の一部）', () => {
    // 文章の並べ替えの解説にある「X→Y。」（2つの文の前後関係）が、正しい順の中で隣り合っていること
    for (const q of questions.filter((x) => !x.stem.includes(BLANKS))) {
      const { order } = parse(q)
      for (const step of q.explanation) {
        for (const m of step.matchAll(/([ア-オ])→([ア-オ])。/g)) {
          const i = order.indexOf(m[1])
          expect(order[i + 1], `${q.key} の「${m[0]}」`).toBe(m[2])
        }
      }
    }
  })
})

describe('vb-order ノート', () => {
  it('分野が vb-order で、例題が「正しい順」を1ステップずつ埋める', () => {
    expect(note.topic).toBe('vb-order')
    // 例題のうち slots の図を使うものが2つ以上ある
    const withSlots = note.patterns.filter((p) => p.example.steps.some((s) => s.figure?.type === 'slots'))
    expect(withSlots.length).toBeGreaterThanOrEqual(2)
  })

  it('ノートの例題の答えが、例題中の「正しい順」と合っている', () => {
    for (const p of note.patterns) {
      const e = p.example
      const m = /【(\d)番目】/.exec(e.stem)
      if (!m) continue
      const items: Record<string, string> = {}
      for (const line of e.stem.split('\n')) {
        const mm = /^([ア-オ])　(.+)$/.exec(line)
        if (mm) items[mm[1]] = mm[2]
      }
      const all = e.steps.map((s) => `${s.text}\n${s.calc ?? ''}`).join('\n')
      const om = ORDER_RE.exec(all)
      if (!om) continue
      const order = om[1].split('→')
      expect([...order].sort(), p.title).toEqual([...SYMBOLS].sort())
      expect(e.answer, p.title).toBe(order[Number(m[1]) - 1])
    }
  })
})
