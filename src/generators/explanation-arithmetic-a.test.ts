import { describe, expect, it } from 'vitest'
import basics from './basics'
import ratio from './ratio'
import profit from './profit'
import speed from './speed'
import { noteFiles } from '../content'
import { noteTexts } from '../lib/validate'

// 解説の途中式の計算が合っているかを確かめる（計算の基礎・割合と比・損益算・速さの型）。
// 考え方は explanation-arithmetic.test.ts と同じ。
// 「A = B = C」のように = でつながれた数式の部分を取り出し、となり合う数式の値が等しいかを調べる。
// 3桁区切りのカンマは取り除いてから調べる。分数 {{a/b}} も計算できる。
// 文字や記号（□ など）を含む部分、比（3:4）を含む行は調べない。

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 104729 + 19)

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

function arithPart(seg: string, position: 'first' | 'middle' | 'last'): string | null {
  const t = seg.trim()
  if (ARITH.test(t) && t !== '') return t
  if (position === 'last') {
    const m = /^\s*((?:\{\{\d+\/\d+\}\}|[\d\s()+\-−×÷.])+)/.exec(seg)
    if (m && m[1].trim() !== '') return m[1].trim()
  }
  if (position === 'first') {
    const m = /(?:^|[\s:：、。（）「」])((?:\{\{\d+\/\d+\}\}|[\d\s()+\-−×÷.])+)\s*$/.exec(seg)
    if (m && m[1].trim() !== '') return m[1].trim()
  }
  return null
}

function checkLine(raw: string): string[] {
  const errors: string[] = []
  // 3桁区切りのカンマを取り除く
  const line = raw.replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
  if (!line.includes(' = ')) return errors
  if (/\d:\d|x:|:x/.test(line)) return errors // 比の式は調べない
  if (/[割厘]/.test(line)) return errors // 歩合（3割5分 = 35% など）は単位の読みかえなので調べない
  const segs = line.split(' = ')
  // 百分率の記号 % は取り除いて数値だけで調べる。
  // 「0.5 × 100 = 50%」も「30% = 0.3」も正しい式なので、% がつく部分は100倍・100分の1の違いを許す
  const flags = segs.map((s) => /\d%/.test(s))
  const parts = segs.map((s, i) =>
    arithPart(s.replace(/(\d)%/g, '$1'), i === 0 ? 'first' : i === segs.length - 1 ? 'last' : 'middle'),
  )
  for (let i = 0; i + 1 < parts.length; i++) {
    const a = parts[i]
    const b = parts[i + 1]
    if (a === null || b === null) continue
    const va = evaluate(a)
    const vb = evaluate(b)
    if (va === null || vb === null) continue
    const pct = flags[i] || flags[i + 1]
    const same = Math.abs(va - vb) < 1e-9
    const scaled = pct && (Math.abs(va * 100 - vb) < 1e-9 || Math.abs(va - vb * 100) < 1e-9)
    if (!same && !scaled) errors.push(`「${a}」(=${va}) と「${b}」(=${vb}) が等しくない`)
  }
  return errors
}

describe('解説の途中式の計算（非言語A）', () => {
  it('checkLine 自体の確認', () => {
    expect(checkLine('定価 = 原価 × (1 + 0.5) = 7,400 × 1.5 = 11,100円')).toEqual([])
    expect(checkLine('1,360 ÷ 3,400 = {{1360/3400}} = {{2/5}}（680 で約分）')).toEqual([])
    expect(checkLine('0.5 × 100 = 50%')).toEqual([])
    expect(checkLine('{{3/4}} = {{75/100}} = 75%')).toEqual([])
    expect(checkLine('定価 = 7,400 × 1.5 = 11,000円')).not.toEqual([])
    expect(checkLine('0.5 × 100 = 55%')).not.toEqual([])
    expect(checkLine('1,360 ÷ 2 = 680、680 × 5 = 3,400')).toEqual([])
  })

  for (const [name, gens] of [
    ['nv-basics', basics],
    ['nv-ratio', ratio],
    ['nv-profit', profit],
    ['nv-speed', speed],
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
        expect(checked).toBeGreaterThan(0)
      })
    }
  }
})

// ---- 解き方ノート ----
// ノートは「説明文（text）」と「計算式1行（calc）」に分かれている。
// 文字は noteTexts() で全部取り出せる（公式・例・例題の文・図の中の文字を含む）。

/**
 * 計算式（calc）用のゆるい検査。単位（円・km・分・人 など）や見出し（「行き」など）を取りのぞいて、
 * 数字と記号だけで「A = B = C」の値が等しいかを調べる。
 * 取りのぞいたあとに式として読めない部分（「1時間20分」「□」など）は調べない。
 * 注意: 「1km = 1000m」のような単位の読みかえは、単位をはずすと等しくならないので、calc には書かない。
 */
function checkCalc(raw: string): string[] {
  const errors: string[] = []
  const line = raw.replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
  if (!line.includes('=')) return errors
  for (const clause of line.split(/[。、]/)) {
    const segs = clause.split('=')
    if (segs.length < 2) continue
    const pct = segs.map((s) => /\d\s*%/.test(s))
    const vals = segs.map((s) => {
      const expr = s
        .replace(/\{\{(\d+)\/(\d+)\}\}/g, '($1/$2)')
        .replace(/[^\d\s()+\-−×÷./]/g, ' ') // 単位や文字は空白に
        .replace(/\s+/g, ' ')
        .trim()
      return expr === '' ? null : evaluate(expr)
    })
    for (let i = 0; i + 1 < segs.length; i++) {
      const a = vals[i]
      const b = vals[i + 1]
      if (a === null || b === null) continue
      const same = Math.abs(a - b) < 1e-9
      const scaled = (pct[i] || pct[i + 1]) && (Math.abs(a * 100 - b) < 1e-9 || Math.abs(a - b * 100) < 1e-9)
      if (!same && !scaled) errors.push(`「${segs[i].trim()}」(=${a}) と「${segs[i + 1].trim()}」(=${b}) が等しくない`)
    }
  }
  return errors
}

describe('解き方ノートの途中式の計算（非言語A）', () => {
  it('checkCalc 自体の確認', () => {
    expect(checkCalc('2,000 × 1.3 = 2,600円')).toEqual([])
    expect(checkCalc('行き 120 ÷ 60 = 2時間、帰り 120 ÷ 40 = 3時間')).toEqual([])
    expect(checkCalc('{{35/100}} = 35%')).toEqual([])
    expect(checkCalc('30% + 5% = 35%')).toEqual([])
    expect(checkCalc('□ = 4 ÷ 0.04 = 100g')).toEqual([])
    expect(checkCalc('10 + 70 = 80分 = 1時間20分')).toEqual([])
    expect(checkCalc('2,000 × 1.3 = 2,500円')).not.toEqual([])
    expect(checkCalc('{{35/100}} = 36%')).not.toEqual([])
    expect(checkCalc('40 ÷ 60 = {{3/4}}時間')).not.toEqual([])
  })

  for (const topic of ['nv-basics', 'nv-ratio', 'nv-profit', 'nv-speed']) {
    it(`${topic}: ノートの式の数値が合っている`, () => {
      const note = noteFiles[topic]
      expect(note, `${topic}.json がある`).toBeDefined()
      // よくある間違い（pitfalls）には、わざと誤った式を書くことがあるので調べない
      const lines = noteTexts({ ...note, pitfalls: [] })
      let checked = 0
      for (const line of lines) {
        // 「。」「、」で区切った1文ずつ調べる
        for (const clause of line.split(/[。、]/)) {
          expect(checkLine(clause), `${topic}\n${line}`).toEqual([])
          if (clause.includes(' = ')) checked++
        }
      }
      expect(checked).toBeGreaterThan(30)
    })

    it(`${topic}: 計算式（calc）の数値が、単位をはずしても合っている`, () => {
      const note = noteFiles[topic]
      const calcs = note.patterns.flatMap((p) => p.example.steps.flatMap((s) => (s.calc ? [s.calc] : [])))
      expect(calcs.length, `${topic} に calc がある`).toBeGreaterThan(10)
      for (const calc of calcs) {
        expect(checkCalc(calc), `${topic}\n${calc}`).toEqual([])
      }
    })
  }
})
