import { describe, expect, it } from 'vitest'
import { createRng } from '../lib/rng'
import { comb, perm } from '../lib/math'
import { SPECS, type Spec } from './combination'

// 場合の数の型の正しさを、「総当たりの数え上げ」で確かめる。
// 型の draw でパラメータを取り出し、並べ方・選び方をすべて書き出して数え、
// 正解の選択肢と一致するかを見る（公式は使わず、実際に全部数える）。

const SEEDS = Array.from({ length: 1000 }, (_, i) => i * 7919 + 1)

// ---- 総当たりの道具 ----

const popcount = (m: number) => {
  let c = 0
  for (; m; m &= m - 1) c++
  return c
}

/** n人から選ぶ（ビットが立っている人が選ばれた人）。条件に合う選び方を数える */
function countSubsets(n: number, ok: (mask: number) => boolean): number {
  let c = 0
  for (let mask = 0; mask < 1 << n; mask++) if (ok(mask)) c++
  return c
}

/** 0..n-1 の並べ替えをすべて作る */
const permCache = new Map<number, number[][]>()
function permutations(n: number): number[][] {
  const hit = permCache.get(n)
  if (hit) return hit
  const out: number[][] = []
  const rec = (cur: number[], used: boolean[]) => {
    if (cur.length === n) {
      out.push(cur.slice())
      return
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue
      used[i] = true
      cur.push(i)
      rec(cur, used)
      cur.pop()
      used[i] = false
    }
  }
  rec([], Array(n).fill(false))
  permCache.set(n, out)
  return out
}

/** n個から重複なしで r個を順に並べたものを数える */
function countSequences(n: number, r: number, ok: (seq: number[]) => boolean = () => true): number {
  let c = 0
  const rec = (cur: number[], used: boolean[]) => {
    if (cur.length === r) {
      if (ok(cur)) c++
      return
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue
      used[i] = true
      cur.push(i)
      rec(cur, used)
      cur.pop()
      used[i] = false
    }
  }
  rec([], Array(n).fill(false))
  return c
}

/** 東(E)・北(N)の動きの並びをすべて作り、東が a回・北が b回のものだけ返す */
function paths(a: number, b: number): string[] {
  const out: string[] = []
  const len = a + b
  for (let bits = 0; bits < 1 << len; bits++) {
    let s = ''
    for (let i = 0; i < len; i++) s += bits & (1 << i) ? 'E' : 'N'
    if (s.split('E').length - 1 === a) out.push(s)
  }
  return out
}

// ---- 共通の検査 ----

function run<P>(s: Spec<P>, seed: number) {
  const rng = createRng(seed)
  const p = s.draw(rng)
  const body = s.build(p, rng)
  return { p, body }
}

/**
 * mistake: 「最もよくある間違い」の選択肢の文字列（なければ null）。
 * 正解の位置を散らすため毎回入るとは限らないが、ほとんどの問題には入っているはず。
 */
function check<P>(
  name: string,
  s: Spec<P>,
  expected: (p: P) => string,
  mistake?: (p: P) => string | null,
) {
  describe(name, () => {
    it('総当たりの数え上げと、正解の選択肢が一致する', () => {
      let withMistake = 0
      let applicable = 0
      for (const seed of SEEDS) {
        const { p, body } = run(s, seed)
        const want = expected(p)
        const choices = body.choices!
        const ctx = `seed=${seed} p=${JSON.stringify(p)}\n${body.stem}\n${choices.join(' / ')}`
        expect(choices[body.answer as number], ctx).toBe(want)
        expect(body.explanation[body.explanation.length - 1], ctx).toBe(`答え: ${want}`)
        expect(choices.length, ctx).toBe(5)
        expect(new Set(choices).size, ctx).toBe(5)
        // generate() 経由（アプリが使う経路）でも同じ問題になる
        const q = s.generator.generate(seed)
        expect(q.choices![q.answer as number], ctx).toBe(want)
        expect(q.stem).toBe(body.stem)
        const m = mistake?.(p)
        if (m && m !== want) {
          applicable++
          if (choices.includes(m)) withMistake++
        }
      }
      if (mistake) expect(withMistake / applicable, `よくある間違いが選択肢に入る割合 ${withMistake}/${applicable}`).toBeGreaterThan(0.7)
    })
  })
}

const t = (n: number) => `${n}通り`

describe('nv-combination の問題の型', () => {
  it('型が10個以上あり、難易度1が2つ以上ある', () => {
    const gens = Object.values(SPECS).map((s) => s.generator)
    expect(gens.length).toBeGreaterThanOrEqual(10)
    expect(gens.filter((g) => g.difficulty === 1).length).toBeGreaterThanOrEqual(2)
    expect(gens.some((g) => g.difficulty === 3)).toBe(true)
  })

  // よくある間違い: 順列と組合せの取り違え
  check(
    'arrange（選んで並べる）',
    SPECS.arrange,
    ({ n, r }) => t(countSequences(n, r)),
    ({ n, r }) => t(comb(n, r)),
  )

  check(
    'choose（選ぶだけ）',
    SPECS.choose,
    ({ n, r }) => t(countSubsets(n, (m) => popcount(m) === r)),
    ({ n, r }) => t(perm(n, r)),
  )

  // よくある間違い: 同じ組を2回ずつ数えた
  const UNITS = ['試合', '回', '回', '本']
  check(
    'round-robin（総当たり）',
    SPECS.roundRobin,
    ({ n, ctx }) => {
      let pairs = 0
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs++
      return `${pairs}${UNITS[ctx]}`
    },
    ({ n, ctx }) => `${n * (n - 1)}${UNITS[ctx]}`,
  )

  check('groups（別々に選ぶ）', SPECS.groups, ({ a, b, x, y }) =>
    t(
      countSubsets(a + b, (m) => {
        const men = popcount(m & ((1 << a) - 1))
        const women = popcount(m >> a)
        return men === x && women === y
      }),
    ),
  )

  check(
    'include（特定の人を含む・含まない）',
    SPECS.include,
    ({ mode, n, r }) =>
      t(
        countSubsets(n, (m) => {
          if (popcount(m) !== r) return false
          const hasA = (m & 1) !== 0
          const hasB = (m & 2) !== 0
          if (mode === 'must') return hasA
          if (mode === 'not') return !hasA
          return hasA && hasB
        }),
      ),
    // よくある間違い: 条件を無視して全体から選んだ（含む／含まないの取り違え）
    ({ mode, n, r }) => (mode === 'both' ? t(comb(n - 1, r - 1)) : t(comb(n, r))),
  )

  // よくある間違い: 「先に1人選んで残りから選ぶ」で二重に数えた
  check(
    'at-least（少なくとも1人）',
    SPECS.atLeast,
    ({ a, b, r }) => t(countSubsets(a + b, (m) => popcount(m) === r && m >> a !== 0)),
    ({ a, b, r }) => t(b * comb(a + b - 1, r - 1)),
  )

  check('adjacent（隣り合う）', SPECS.adjacent, ({ n, group }) => {
    let c = 0
    for (const order of permutations(n)) {
      const pos = group.map((g) => order.indexOf(g))
      // 並んだ位置が連続している（最大 − 最小 = 人数 − 1）
      if (Math.max(...pos) - Math.min(...pos) === group.length - 1) c++
    }
    return t(c)
  })

  check('apart（隣り合わない）', SPECS.apart, (p) => {
    if (p.kind === 'two') {
      let c = 0
      for (const order of permutations(p.n)) {
        const [x, y] = p.pair.map((g) => order.indexOf(g))
        if (Math.abs(x - y) !== 1) c++
      }
      return t(c)
    }
    // 0..m-1 が男子、m..m+f-1 が女子。女子どうしが隣り合う並びを除く
    let c = 0
    for (const order of permutations(p.m + p.f)) {
      let adj = false
      for (let i = 0; i + 1 < order.length; i++) if (order[i] >= p.m && order[i + 1] >= p.m) adj = true
      if (!adj) c++
    }
    return t(c)
  })

  check('digits（0を含むカードで整数）', SPECS.digits, ({ mode, cards }) =>
    t(
      countSequences(cards.length, 3, (seq) => {
        const [h, , o] = seq.map((i) => cards[i])
        if (h === 0) return false // 3桁の整数の百の位は0にできない
        return mode === 'all' || o % 2 === 0
      }),
    ),
  )

  check('route（最短の道順）', SPECS.route, ({ a, b }) => t(paths(a, b).length))

  check('route-via（途中の地点を通る）', SPECS.routeVia, ({ a, b, p, q }) =>
    t(
      paths(a, b).filter((s) => {
        // p+q 歩進んだ時点で、東がちょうど p回（= 地点Cにいる）
        const head = s.slice(0, p + q)
        return head.split('E').length - 1 === p
      }).length,
    ),
  )
})

// 問題文が、型のパラメータどおりの内容になっているか（数字や名前の書き間違いがないか）を確かめる
describe('nv-combination の問題文がパラメータどおりである', () => {
  const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  const mentions = <P>(s: Spec<P>, want: (p: P) => string[]) => {
    for (const seed of SEEDS.slice(0, 300)) {
      const { p, body } = run(s, seed)
      for (const w of want(p)) expect(body.stem, `seed=${seed} ${JSON.stringify(p)}`).toContain(w)
    }
  }

  it('arrange / choose / round-robin', () => {
    mentions(SPECS.arrange, ({ n, r, ctx }) => [
      `${n}`,
      // 役を選ぶ問題文には人数ではなく役の名前が書かれている
      [`${r}人を選び`, r === 2 ? '委員長と副委員長' : '委員長、副委員長、書記', `${r}枚を選んで`, `1位から${r}位`][ctx],
    ])
    mentions(SPECS.choose, ({ n, r }) => [`${n}`, `${r}`])
    mentions(SPECS.roundRobin, ({ n }) => [`${n}`])
  })

  it('groups / include / at-least', () => {
    mentions(SPECS.groups, ({ a, b, x, y }) => [`${a}人`, `${b}人`, `${x}人`, `${y}人`])
    mentions(SPECS.include, ({ mode, n, r }) => [
      `${n}人`,
      `${r}人`,
      mode === 'must' ? '必ず含まれる' : mode === 'not' ? '含まれない' : 'どちらも含まれる',
    ])
    mentions(SPECS.atLeast, ({ a, b, r }) => [`${a}人`, `${b}人`, `${a + b}人`, `${r}人を選ぶ`, '少なくとも1人'])
  })

  it('adjacent / apart（並べる人の名前）', () => {
    mentions(SPECS.adjacent, ({ n, k, group }) => {
      const names = group.map((i) => LABELS[i])
      return [
        LABELS.slice(0, n).join('、'),
        k === 2 ? `${names[0]}と${names[1]}が隣り合う` : `${names.join('、')}の3つが続けて`,
      ]
    })
    mentions(SPECS.apart, (p) =>
      p.kind === 'two'
        ? [LABELS.slice(0, p.n).join('、'), `${LABELS[p.pair[0]]}と${LABELS[p.pair[1]]}が隣り合わない`]
        : [`男子${p.m}人`, `女子${p.f}人`, '女子どうし'],
    )
  })

  it('digits / route / route-via', () => {
    mentions(SPECS.digits, ({ mode, cards }) => [cards.join('、'), `${cards.length}枚`, mode === 'even' ? '3桁の偶数' : '3桁の整数'])
    mentions(SPECS.route, ({ a, b }) => [`東へ${a}区画`, `北へ${b}区画`])
    mentions(SPECS.routeVia, ({ a, b, p, q }) => [`東へ${a}区画`, `北へ${b}区画`, `東へ${p}区画、北へ${q}区画進んだ地点C`])
  })
})
