import { describe, expect, it, vi } from 'vitest'
import combination from './combination'
import probability from './probability'
import sets from './sets'
import { noteFiles } from '../content'
import { noteExamples, noteTexts } from '../lib/validate'

// 解説の途中式の計算が合っているかを確かめる（場合の数・確率・集合の型）。
// 解き方ノート（場合の数・確率・集合・推論）の中の式も、同じ方法で確かめる。
// 「A = B = C」のように = でつながれた数式の部分を取り出し、となり合う数式の値が等しいかを調べる。
// 例: "5C2 = (5 × 4) ÷ (2 × 1) = 20 ÷ 2 = 10" → (5×4)÷(2×1)、20÷2、10 がすべて同じ値であること。
// 分数 {{a/b}} も計算できる。文字や記号（□ など）を含む部分は調べない。

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 104729 + 17)

/** 数式として評価できる文字だけでできているか */
const ARITH = /^[\d\s()+\-−×÷./{}]+$/

function evaluate(expr: string): number | null {
  const js = expr
    .replace(/\{\{(\d+)\/(\d+)\}\}/g, '($1/$2)')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
  if (!/^[\d\s()+\-*/.]+$/.test(js)) return null
  try {
    const v = new Function(`return (${js})`)()
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** セグメント（= で区切った1つの部分）の、数式として使える範囲を取り出す。使えなければ null */
function arithPart(seg: string, position: 'first' | 'middle' | 'last'): string | null {
  const t = seg.trim()
  if (ARITH.test(t) && t !== '') return t
  if (position === 'last') {
    // 先頭の数式部分だけ使う（後ろに「通り」「（説明）」などが続く）
    const m = /^\s*((?:\{\{\d+\/\d+\}\}|[\d\s()+\-−×÷.])+)/.exec(seg)
    if (m && m[1].trim() !== '') return m[1].trim()
  }
  if (position === 'first') {
    // 末尾の数式部分だけ使う。ただし、直前が文字・数字・演算記号（"7P3" の 3、"5! − 48" の 48 など）のときは使わない。
    // 使うのは、直前が「：」「。」「、」「）」「」」のように、新しい文が始まる位置のときだけ
    const m = /((?:\{\{\d+\/\d+\}\}|[\d(])(?:\{\{\d+\/\d+\}\}|[\d\s()+\-−×÷.])*)\s*$/.exec(seg)
    if (m && m[1].trim() !== '') {
      const prefix = seg.slice(0, m.index).trimEnd()
      if (prefix === '' || /[:：、。」）]$/.test(prefix)) return m[1].trim()
    }
  }
  return null
}

function checkLine(line: string): string[] {
  const errors: string[] = []
  if (!line.includes(' = ')) return errors
  const segs = line.split(' = ')
  const parts = segs.map((s, i) => arithPart(s, i === 0 ? 'first' : i === segs.length - 1 ? 'last' : 'middle'))
  for (let i = 0; i + 1 < parts.length; i++) {
    const a = parts[i]
    const b = parts[i + 1]
    if (a === null || b === null) continue
    const va = evaluate(a)
    const vb = evaluate(b)
    if (va === null || vb === null) continue
    if (Math.abs(va - vb) > 1e-9) errors.push(`「${a}」(=${va}) と「${b}」(=${vb}) が等しくない`)
  }
  return errors
}

describe('解説の途中式の計算', () => {
  it('checkLine 自体の確認（正しい式は通り、間違った式は見つかる）', () => {
    expect(checkLine('5C2 = (5 × 4) ÷ (2 × 1) = 20 ÷ 2 = 10')).toEqual([])
    expect(checkLine('7P3 = 7 × 6 × 5 = 210')).toEqual([])
    expect(checkLine('確率 = {{1/3}} × {{3/4}} = {{3/12}} = {{1/4}}')).toEqual([])
    expect(checkLine('Aだけ = A全体 − 両方 = 65 − 16 = 49（説明）')).toEqual([])
    expect(checkLine('7P3 = 7 × 6 × 5 = 200')).not.toEqual([])
    expect(checkLine('6 × 4 = 25通り')).not.toEqual([])
    expect(checkLine('1 − {{3/5}} = {{3/5}}')).not.toEqual([])
  })

  for (const [name, gens] of [
    ['nv-combination', combination],
    ['nv-probability', probability],
    ['nv-sets', sets],
  ] as const) {
    for (const g of gens) {
      it(`${g.id}: 途中式の数値が合っている`, () => {
        let checked = 0
        for (const seed of SEEDS) {
          const q = g.generate(seed)
          for (const line of [...q.explanation, ...(q.hint ? [q.hint] : [])]) {
            const errs = checkLine(line)
            expect(errs, `${name} seed=${seed}\n${line}`).toEqual([])
            if (line.includes(' = ')) checked++
          }
        }
        // 途中式が少なくとも少しは含まれている（検査が空振りしていない）
        expect(checked).toBeGreaterThan(0)
      })
    }
  }

  for (const topic of ['nv-combination', 'nv-probability', 'nv-sets'] as const) {
    it(`${topic} の解き方ノート: 途中式の数値が合っている`, () => {
      const note = noteFiles[topic]
      expect(note).toBeDefined()
      // よくある間違い（pitfalls）には、わざと誤った式を書くことがあるので調べない
      const lines = noteTexts({ ...note, pitfalls: [] })
      let checked = 0
      for (const line of lines) {
        for (const clause of line.split(/[。、]/)) {
          expect(checkLine(clause), `${topic}\n${line}`).toEqual([])
          if (clause.includes(' = ')) checked++
        }
      }
      expect(checked).toBeGreaterThan(5)
    })

    it(`${topic} の解き方ノート: 例題の最後のステップに答えの数が出てくる`, () => {
      for (const e of noteExamples(noteFiles[topic])) {
        const last = e.steps[e.steps.length - 1]
        const core = e.answer.match(/\{\{\d+\/\d+\}\}|\d[\d,.]*/)?.[0]
        if (core) expect(`${last.text} ${last.calc ?? ''}`, e.stem).toContain(core)
      }
    })
  }
})

describe('問題文・ヒント・解説の体裁（場合の数・確率・集合の型）', () => {
  for (const g of [...combination, ...probability, ...sets]) {
    it(`${g.id}: 問題文は「。」（または「）」）で終わり、ヒントは1〜2文のです・ます調、解説は「答え: 」で終わる`, () => {
      for (const seed of SEEDS.slice(0, 100)) {
        const q = g.generate(seed)
        expect(/[。）]$/.test(q.stem), `stem: ${q.stem}`).toBe(true)
        expect(q.hint, 'hint がない').toBeTruthy()
        const hint = q.hint!
        expect(/(ます|です)。$/.test(hint), `hint: ${hint}`).toBe(true)
        const sentences = hint.split('。').filter((x) => x.trim() !== '')
        expect(sentences.length, `hint: ${hint}`).toBeGreaterThanOrEqual(1)
        expect(sentences.length, `hint: ${hint}`).toBeLessThanOrEqual(2)
        expect(q.explanation[q.explanation.length - 1].startsWith('答え: ')).toBe(true)
        expect(q.explanation.length).toBeGreaterThanOrEqual(3)
        expect(q.choices!.length).toBeGreaterThanOrEqual(5)
      }
    })
  }

  it('問題の生成で Math.random を使っていない（呼ばれたらエラーにして確かめる）', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random は使わない（乱数は rng から取る）')
    })
    try {
      for (const g of [...combination, ...probability, ...sets]) {
        for (const seed of SEEDS.slice(0, 30)) g.generate(seed)
      }
    } finally {
      spy.mockRestore()
    }
  })
})
