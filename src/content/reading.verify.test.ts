import { describe, expect, it } from 'vitest'
import rawQuestions from './questions/vb-reading.json'
import rawNote from './notes/vb-reading.json'
import type { AuthoredQuestion, Note } from '../types'

// 長文読解（vb-reading）の検証。
//  - 5本の文章 × 3問の組問題になっているか（同じ passage、groupKey、目安時間、文字数）
//  - 合致を問う問題は定型の選択肢か、解説の ア・イ・ウ の判定（合致する／しない）が正解と一致するか
//  - 解説で「 」で引用した本文の箇所が、本文・問題文・選択肢の中に実際にあるか

const questions = rawQuestions as unknown as AuthoredQuestion[]
const note = rawNote as unknown as Note

const MATCH_STEM = '次のア、イ、ウのうち、本文の内容と合致するものはどれか。'
const MATCH_CHOICES = ['アだけ', 'イだけ', 'ウだけ', 'アとイ', 'アとウ', 'イとウ']
const MATCH_SETS: string[][] = [['ア'], ['イ'], ['ウ'], ['ア', 'イ'], ['ア', 'ウ'], ['イ', 'ウ']]

const strip = (s: string) => s.replace(/[「」『』]/g, '')

/** 一番外側の「 」の中身を取り出す（入れ子の『 』は中身に含める） */
function quotes(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '「') {
      if (depth === 0) cur = ''
      else cur += ch
      depth++
    } else if (ch === '」') {
      depth--
      if (depth === 0) out.push(cur)
      else cur += ch
    } else if (depth > 0) cur += ch
  }
  return out
}

const isMatch = (q: AuthoredQuestion) => q.stem.startsWith(MATCH_STEM)

describe('vb-reading 組問題', () => {
  const groups = new Map<string, AuthoredQuestion[]>()
  for (const q of questions) {
    const k = q.groupKey ?? '(なし)'
    groups.set(k, [...(groups.get(k) ?? []), q])
  }

  it('15問・5本×3問で、groupKey は g01〜g05', () => {
    expect(questions).toHaveLength(15)
    expect([...groups.keys()]).toEqual(['vb-reading-g01', 'vb-reading-g02', 'vb-reading-g03', 'vb-reading-g04', 'vb-reading-g05'])
    for (const [k, qs] of groups) expect(qs, k).toHaveLength(3)
  })

  it('同じ組の3問は同じ passage で、続けて並んでいる。文章は500〜800字', () => {
    questions.forEach((q, i) => {
      if (i % 3 === 0) return
      expect(q.groupKey, q.key).toBe(questions[i - 1].groupKey)
    })
    for (const [k, qs] of groups) {
      const p = qs[0].passage ?? ''
      expect(new Set(qs.map((q) => q.passage)).size, k).toBe(1)
      expect(p.length, `${k} の文字数`).toBeGreaterThanOrEqual(500)
      expect(p.length, `${k} の文字数`).toBeLessThanOrEqual(800)
    }
  })

  it('目安時間: 組の1問目は150秒、2・3問目は60秒', () => {
    for (const qs of groups.values()) {
      expect(qs[0].targetSec, qs[0].key).toBe(150)
      expect(qs[1].targetSec, qs[1].key).toBe(60)
      expect(qs[2].targetSec, qs[2].key).toBe(60)
    }
  })
})

describe('vb-reading 選択肢と正解', () => {
  it('合致を問う形は、定型の選択肢（6つ）', () => {
    const ms = questions.filter(isMatch)
    expect(ms.length).toBeGreaterThanOrEqual(3)
    for (const q of ms) {
      expect(q.choices, q.key).toEqual(MATCH_CHOICES)
      expect(q.stem, q.key).toMatch(/\nア　.+\nイ　.+\nウ　.+$/)
    }
  })

  it('それ以外は5択で、single', () => {
    for (const q of questions) {
      expect(q.format, q.key).toBe('single')
      if (!isMatch(q)) expect(q.choices, q.key).toHaveLength(5)
    }
  })

  it('合致の問題: 解説のア・イ・ウの判定が、正解の選択肢と一致する', () => {
    for (const q of questions.filter(isMatch)) {
      const truth = new Set<string>()
      for (const sym of ['ア', 'イ', 'ウ']) {
        const step = q.explanation.find((s) => s.startsWith(`${sym}：`))
        expect(step, `${q.key} の ${sym} の判定`).toBeDefined()
        const ok = step!.endsWith('→ 合致する。')
        const ng = step!.endsWith('→ 合致しない。')
        expect(ok || ng, `${q.key} の ${sym} の判定の書き方`).toBe(true)
        if (ok) truth.add(sym)
      }
      const expected = MATCH_SETS[q.answer as number]
      expect([...truth].sort(), q.key).toEqual([...expected].sort())
    }
  })

  it('解説の最後が「答え: 正解の選択肢」', () => {
    for (const q of questions) {
      const last = q.explanation[q.explanation.length - 1]
      expect(last, q.key).toBe(`答え: ${q.choices![q.answer as number]}`)
    }
  })

  it('空欄補充は、空欄の記号が本文にある。問いの種類がそろっている', () => {
    const kinds = { blank: 0, ref: 0, claim: 0, match: 0 }
    for (const q of questions) {
      if (isMatch(q)) kinds.match++
      else if (q.stem.includes('空欄')) {
        kinds.blank++
        const m = /空欄（([A-Z])）/.exec(q.stem)
        expect(m, q.key).not.toBeNull()
        expect(q.passage, q.key).toContain(`（${m![1]}）`)
      } else if (q.stem.includes('が指す内容')) kinds.ref++
      else if (q.stem.includes('筆者の考え')) kinds.claim++
      else throw new Error(`${q.key} の問いの種類が分からない`)
    }
    expect(kinds.blank).toBeGreaterThanOrEqual(3)
    expect(kinds.ref).toBeGreaterThanOrEqual(3)
    expect(kinds.claim).toBeGreaterThanOrEqual(3)
    expect(kinds.match).toBeGreaterThanOrEqual(3)
  })

  it('指示語の問題: 問題文で引用した語句が本文にある', () => {
    for (const q of questions.filter((x) => x.stem.includes('が指す内容'))) {
      const qs = quotes(q.stem)
      expect(qs.length, q.key).toBeGreaterThanOrEqual(1)
      for (const s of qs) expect(strip(q.passage!), `${q.key} 「${s}」`).toContain(strip(s))
    }
  })

  it('正解の位置（添字）がかたよらない。同じ選択肢が重複しない', () => {
    const count = [0, 0, 0, 0, 0]
    for (const q of questions.filter((x) => !isMatch(x))) count[q.answer as number]++
    for (const c of count) expect(c).toBeGreaterThanOrEqual(2)
    for (const c of count) expect(c).toBeLessThanOrEqual(3)
    for (const q of questions) expect(new Set(q.choices).size, q.key).toBe(q.choices!.length)
  })

  it('難易度の内訳', () => {
    const n = [1, 2, 3].map((d) => questions.filter((q) => q.difficulty === d).length)
    expect(n[0]).toBeGreaterThanOrEqual(4)
    expect(n[1]).toBeGreaterThanOrEqual(5)
    expect(n[2]).toBeGreaterThanOrEqual(3)
  })
})

describe('vb-reading 解説の引用', () => {
  it('解説で「 」に入れた語句は、本文・問題文・選択肢のどこかにそのままある', () => {
    for (const q of questions) {
      const haystack = strip([q.passage ?? '', q.stem, ...(q.choices ?? [])].join('\n'))
      for (const step of q.explanation) {
        for (const quote of quotes(step)) {
          // 「 」の中の「…」は省略として、前後に分けて確かめる
          for (const part of strip(quote).split('…')) {
            if (part.trim() === '') continue
            expect(haystack, `${q.key} の引用「${part}」`).toContain(part)
          }
        }
      }
    }
  })

  it('解説は、本文の根拠を引用している（各問に1つ以上の「 」）', () => {
    for (const q of questions) {
      const n = q.explanation.flatMap((s) => quotes(s)).length
      expect(n, q.key).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('vb-reading ノート', () => {
  it('分野が vb-reading で、例題が図（flow か table）を使っている', () => {
    expect(note.topic).toBe('vb-reading')
    const figs = note.patterns.flatMap((p) => [p.example.figure, ...p.example.steps.map((s) => s.figure)]).filter(Boolean)
    expect(figs.some((f) => f!.type === 'flow')).toBe(true)
    expect(figs.some((f) => f!.type === 'table')).toBe(true)
  })
})
