import { describe, expect, it } from 'vitest'
import rawQuestions from './questions/nv-inference.json'
import rawNote from './notes/nv-inference.json'
import type { AuthoredQuestion, Note } from '../types'
import { noteExamples } from '../lib/validate'

// 推論（nv-inference）の総当たり検証。
// 各問題について「前提条件を満たすすべての状態」を機械的に列挙し、そこから正解を計算して、
// JSON の answer と一致するかを確かめる。
//  - 必ず正しい（single）: 各推論が、条件を満たすすべての状態で真か
//  - 考えられるものをすべて選ぶ（multi）: 条件を満たす状態で取りうる値の集合
//  - どの情報があれば確定するか（single）: 情報を足したときに状態が1つに絞れるか
// さらに、問題文に書いた前提条件・推論の文と、ここで検証している条件・推論の文が同じであることも確かめる
// （文章だけ直して検証が古いまま、という食い違いを防ぐ）。

const questions = rawQuestions as unknown as AuthoredQuestion[]
const note = rawNote as unknown as Note

// ---------- 汎用の小道具 ----------

/** 並べ方（順列）をすべて列挙する */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()]
  const out: T[][] = []
  items.forEach((x, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) out.push([x, ...p])
  })
  return out
}

/** 長さ n で各要素が lo〜hi の整数の組を、keep を満たすものだけ列挙する（個数の組み合わせ・点数など） */
function tuples(n: number, lo: number, hi: number, keep: (t: number[]) => boolean = () => true): number[][] {
  const out: number[][] = []
  const cur: number[] = []
  const rec = (): void => {
    if (cur.length === n) {
      if (keep(cur)) out.push(cur.slice())
      return
    }
    for (let v = lo; v <= hi; v++) {
      cur.push(v)
      rec()
      cur.pop()
    }
  }
  rec()
  return out
}

const sum = (t: readonly number[]) => t.reduce((a, b) => a + b, 0)

/** 並びの中での位置（1始まり）。順位・席・階のどれにも使う */
const pos = (o: readonly string[], x: string) => o.indexOf(x) + 1

// ---------- 条件・推論の表現 ----------

/** text は問題文に書いた文そのもの。ok はその文が状態 s で成り立つかを判定する */
type Cond<S> = { text: string; ok: (s: S) => boolean }
const cond = <S>(text: string, ok: (s: S) => boolean): Cond<S> => ({ text, ok })

const MUST_CHOICES = ['アだけ', 'イだけ', 'ウだけ', 'アとイ', 'アとウ', 'イとウ', 'アとイとウ', '必ず正しいものはない']
const MUST_SETS: number[][] = [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2], []]
const DETERMINE_CHOICES = [
  'カだけで分かるが、キだけでは分からない',
  'キだけで分かるが、カだけでは分からない',
  'カとキの両方で分かるが、片方だけでは分からない',
  'カだけでも、キだけでも分かる',
  'カとキの両方があっても分からない',
]

type Result = { answer: number | number[] }

/** passage の「・」で始まる行が、検証している前提条件の文と同じ（順序も含めて）であること */
function expectBullets<S>(q: AuthoredQuestion, conds: Cond<S>[]): void {
  const lines = (q.passage ?? '')
    .split('\n')
    .filter((l) => l.startsWith('・'))
    .map((l) => l.slice(1))
  expect(lines, `${q.key} の前提条件の文`).toEqual(conds.map((c) => c.text))
}

/** stem の「ア　…」「カ　…」の行が、検証している推論・情報の文と同じであること */
function expectItems<S>(q: AuthoredQuestion, labels: string[], items: Cond<S>[]): void {
  const lines = q.stem.split('\n').filter((l) => /^[ア-ン]　/.test(l))
  expect(lines, `${q.key} の推論の文`).toEqual(items.map((it, i) => `${labels[i]}　${it.text}`))
}

/** 条件を満たす状態だけを残す（1つ以上あること、個数が想定どおりであることも確かめる） */
function liveStates<S>(states: S[], conds: Cond<S>[], expected?: number): S[] {
  const live = states.filter((s) => conds.every((c) => c.ok(s)))
  expect(live.length, '前提条件を満たす状態が1つ以上ある').toBeGreaterThan(0)
  if (expected !== undefined) expect(live.length, '前提条件を満たす状態の数（解説の「○通り」と対応）').toBe(expected)
  return live
}

/** 「必ず正しい」形式。ア・イ・ウのそれぞれが、すべての状態で真かを調べる */
function must<S>(q: AuthoredQuestion, states: S[], conds: Cond<S>[], claims: Cond<S>[], expected?: number): Result {
  expect(q.format).toBe('single')
  expect(q.choices).toEqual(MUST_CHOICES)
  expect(claims.length).toBe(3)
  expectItems(q, ['ア', 'イ', 'ウ'], claims)
  const live = liveStates(states, conds, expected)
  const trueSet = claims.flatMap((c, i) => (live.every(c.ok) ? [i] : []))
  const answer = MUST_SETS.findIndex((set) => set.join() === trueSet.join())
  expect(answer).toBeGreaterThanOrEqual(0)
  return { answer }
}

/**
 * 「考えられるものをすべて選ぶ」形式。条件を満たす状態で取りうる値を集めて、選択肢の添字（昇順）にする。
 * extra は、問いの中で足す条件（例:「Qが4位だったとき、」）。stem の先頭に書いてあること。
 */
function multi<S>(
  q: AuthoredQuestion,
  states: S[],
  conds: Cond<S>[],
  target: (s: S) => string | string[],
  expected?: number,
  extra?: Cond<S>,
): Result {
  expect(q.format).toBe('multi')
  const choices = q.choices ?? []
  let live = liveStates(states, conds)
  if (extra) {
    expect(q.stem.startsWith(extra.text), `${q.key} の stem が「${extra.text}」で始まる`).toBe(true)
    live = liveStates(live, [extra])
  }
  if (expected !== undefined) expect(live.length, '問いの条件も含めて満たす状態の数').toBe(expected)
  const values = new Set(live.flatMap((s) => [target(s)].flat()))
  const answer = choices.flatMap((c, i) => (values.has(c) ? [i] : []))
  expect(answer.length, `取りうる値 ${[...values].join('、')} がすべて選択肢にある`).toBe(values.size)
  return { answer }
}

/** 「どの情報があれば確定するか」形式。key は「確定した」とみなす状態の同一性（普通は並び全体） */
function determine<S>(
  q: AuthoredQuestion,
  states: S[],
  conds: Cond<S>[],
  infos: [Cond<S>, Cond<S>],
  key: (s: S) => string,
  expected?: number,
): Result {
  expect(q.format).toBe('single')
  expect(q.choices).toEqual(DETERMINE_CHOICES)
  expectItems(q, ['カ', 'キ'], infos)
  const live = liveStates(states, conds, expected)
  const [ka, ki] = infos
  const withKa = live.filter(ka.ok)
  const withKi = live.filter(ki.ok)
  const withBoth = live.filter((s) => ka.ok(s) && ki.ok(s))
  // 足す情報が前提条件と矛盾していないこと
  expect(withKa.length, 'カが前提と矛盾しない').toBeGreaterThan(0)
  expect(withKi.length, 'キが前提と矛盾しない').toBeGreaterThan(0)
  expect(withBoth.length, 'カとキが両立する').toBeGreaterThan(0)
  const single = (list: S[]) => new Set(list.map(key)).size === 1
  const a = single(withKa)
  const b = single(withKi)
  const both = single(withBoth)
  let answer: number
  if (a && b) answer = 3
  else if (a) answer = 0
  else if (b) answer = 1
  else if (both) answer = 2
  else answer = 4
  return { answer }
}

// ---------- 発言（うそつき）型の道具 ----------

type Said<S> = { who: string; text: string; holds: (s: S) => boolean }

/** passage の「A「…」」の行が、検証している発言と同じであること */
function expectSaid<S>(q: AuthoredQuestion, said: Said<S>[]): void {
  const lines = (q.passage ?? '').split('\n').filter((l) => /^[A-E]「/.test(l))
  expect(lines, `${q.key} の発言`).toEqual(said.map((x) => `${x.who}「${x.text}」`))
}

// ---------- 各問題の検証 ----------

const P4 = permutations(['P', 'Q', 'R', 'S'])
const P5 = permutations(['P', 'Q', 'R', 'S', 'T'])
const ABCDE = permutations(['A', 'B', 'C', 'D', 'E'])
const ABCDEF = permutations(['A', 'B', 'C', 'D', 'E', 'F'])
const P6 = permutations(['P', 'Q', 'R', 'S', 'T', 'U'])

// 並び（o）は先頭が1位・1番目・左端・1階。以下 o[0] が先頭。
type Order = string[]
// g01（nv-inference-004〜006）の前提条件
const g01Conds: Cond<Order>[] = [
  cond('PはQより先に到着した。', (o) => pos(o, 'P') < pos(o, 'Q')),
  cond('RはSより先に到着した。', (o) => pos(o, 'R') < pos(o, 'S')),
  cond('TはPの直前に到着した。', (o) => pos(o, 'T') + 1 === pos(o, 'P')),
]

// g02（nv-inference-013〜014）の前提条件。状態は [バラ, ユリ, チューリップ] の本数
const flowerStates = tuples(3, 1, 9, (t) => sum(t) === 11)
const g02Conds: Cond<number[]>[] = [
  cond('バラはユリより多い。', (s) => s[0] > s[1]),
  cond('チューリップはバラより多い。', (s) => s[2] > s[0]),
]

const NAMES_3 = ['A', 'B', 'C']
const NAMES_5 = ['A', 'B', 'C', 'D', 'E']

const verifiers: Record<string, (q: AuthoredQuestion) => Result> = {
  // 順序：100m走の4人
  'nv-inference-001': (q) => {
    const conds: Cond<Order>[] = [
      cond('PはQより先にゴールした。', (o) => pos(o, 'P') < pos(o, 'Q')),
      cond('QはRより先にゴールした。', (o) => pos(o, 'Q') < pos(o, 'R')),
      cond('SはPより後にゴールした。', (o) => pos(o, 'S') > pos(o, 'P')),
    ]
    expectBullets(q, conds)
    return must(
      q,
      P4,
      conds,
      [
        cond('Pは1位である。', (o) => pos(o, 'P') === 1),
        cond('Qは2位である。', (o) => pos(o, 'Q') === 2),
        cond('RはSより先にゴールした。', (o) => pos(o, 'R') < pos(o, 'S')),
      ],
      3,
    )
  },

  // 順序：Sの順位として考えられるもの
  'nv-inference-002': (q) => {
    const conds: Cond<Order>[] = [
      cond('QはSより点数が高かった。', (o) => pos(o, 'Q') < pos(o, 'S')),
      cond('SはRより点数が高かった。', (o) => pos(o, 'S') < pos(o, 'R')),
      cond('TはPより点数が高かった。', (o) => pos(o, 'T') < pos(o, 'P')),
    ]
    expectBullets(q, conds)
    return multi(q, P5, conds, (o) => `${pos(o, 'S')}位`, 10)
  },

  // 順序：身長の順番が確定するのはどの情報か
  'nv-inference-003': (q) => {
    // o[0] が最も高い人
    const conds: Cond<Order>[] = [
      cond('QはPより低い。', (o) => pos(o, 'Q') > pos(o, 'P')),
      cond('RはPより低い。', (o) => pos(o, 'R') > pos(o, 'P')),
      cond('SはQより低い。', (o) => pos(o, 'S') > pos(o, 'Q')),
      cond('TはRより低い。', (o) => pos(o, 'T') > pos(o, 'R')),
    ]
    expectBullets(q, conds)
    return determine(
      q,
      P5,
      conds,
      [
        cond('Sは3番目に高い。', (o) => pos(o, 'S') === 3),
        cond('Tは最も低い。', (o) => pos(o, 'T') === 5),
      ],
      (o) => o.join(''),
      6,
    )
  },

  // g01：到着順 ア・イ・ウ
  'nv-inference-004': (q) => {
    expectBullets(q, g01Conds)
    return must(
      q,
      P5,
      g01Conds,
      [
        cond('Tは3位以内に到着した。', (o) => pos(o, 'T') <= 3),
        cond('QとSのどちらかは5位である。', (o) => pos(o, 'Q') === 5 || pos(o, 'S') === 5),
        cond('Rは1位である。', (o) => pos(o, 'R') === 1),
      ],
      6,
    )
  },

  // g01：Qが4位のとき、Rの順位
  'nv-inference-005': (q) => {
    expectBullets(q, g01Conds)
    return multi(
      q,
      P5,
      g01Conds,
      (o) => `${pos(o, 'R')}位`,
      2,
      cond('Qが4位だったとき、', (o) => pos(o, 'Q') === 4),
    )
  },

  // g01：到着順が確定するのはどの情報か
  'nv-inference-006': (q) => {
    expectBullets(q, g01Conds)
    return determine(
      q,
      P5,
      g01Conds,
      [
        cond('Rは1位である。', (o) => pos(o, 'R') === 1),
        cond('Qは5位ではない。', (o) => pos(o, 'Q') !== 5),
      ],
      (o) => o.join(''),
      6,
    )
  },

  // 位置：横一列5席、Eの席
  'nv-inference-007': (q) => {
    const conds: Cond<Order>[] = [
      cond('AとBは隣り合っている。', (o) => Math.abs(pos(o, 'A') - pos(o, 'B')) === 1),
      cond('CはAより左の席に座っている。', (o) => pos(o, 'C') < pos(o, 'A')),
      cond('DはAより右の席に座っている。', (o) => pos(o, 'D') > pos(o, 'A')),
    ]
    expectBullets(q, conds)
    return multi(q, ABCDE, conds, (o) => `${pos(o, 'E')}番`, 8)
  },

  // 位置：円卓6席。「隣」は左右の席、「向かい」は真正面の席
  'nv-inference-008': (q) => {
    const dist = (o: Order, a: string, b: string) => {
      const k = Math.abs(o.indexOf(a) - o.indexOf(b))
      return Math.min(k, 6 - k)
    }
    const next = (o: Order, a: string, b: string) => dist(o, a, b) === 1
    const facing = (o: Order, a: string, b: string) => dist(o, a, b) === 3
    const conds: Cond<Order>[] = [
      cond('PはQの隣に座っている。', (o) => next(o, 'P', 'Q')),
      cond('RはQの向かいに座っている。', (o) => facing(o, 'R', 'Q')),
      cond('SはTの隣に座っている。', (o) => next(o, 'S', 'T')),
    ]
    expectBullets(q, conds)
    return must(
      q,
      P6,
      conds,
      [
        cond('UはPの隣に座っている。', (o) => next(o, 'U', 'P')),
        cond('SはPの向かいに座っている。', (o) => facing(o, 'S', 'P')),
        cond('SはUの隣に座っていない。', (o) => !next(o, 'S', 'U')),
      ],
      // 6つの席に並べる全720通りのうち、条件を満たすもの（席の回転・鏡写しも別々に数える）
      24,
    )
  },

  // 位置：ビルの階、確定する情報（o[0] が1階）
  'nv-inference-009': (q) => {
    const conds: Cond<Order>[] = [
      cond('BはAのすぐ上の階にある。', (o) => pos(o, 'B') === pos(o, 'A') + 1),
      cond('CはEより上の階にある。', (o) => pos(o, 'C') > pos(o, 'E')),
      cond('DはEより下の階にある。', (o) => pos(o, 'D') < pos(o, 'E')),
    ]
    expectBullets(q, conds)
    return determine(
      q,
      ABCDE,
      conds,
      [
        cond('Cは5階にある。', (o) => pos(o, 'C') === 5),
        cond('Aは3階にある。', (o) => pos(o, 'A') === 3),
      ],
      (o) => o.join(''),
      4,
    )
  },

  // 位置：横一列6席、間に1人
  'nv-inference-010': (q) => {
    const conds: Cond<Order>[] = [
      cond('AとBの間には、ちょうど1人が座っている。', (o) => Math.abs(pos(o, 'A') - pos(o, 'B')) === 2),
      cond('CとDは隣り合っている。', (o) => Math.abs(pos(o, 'C') - pos(o, 'D')) === 1),
      cond('EはAより左の席に座っている。', (o) => pos(o, 'E') < pos(o, 'A')),
      cond('FはBより右の席に座っている。', (o) => pos(o, 'F') > pos(o, 'B')),
    ]
    expectBullets(q, conds)
    return must(
      q,
      ABCDEF,
      conds,
      [
        cond('AとCは隣り合っている。', (o) => Math.abs(pos(o, 'A') - pos(o, 'C')) === 1),
        cond('BとEは隣り合っている。', (o) => Math.abs(pos(o, 'B') - pos(o, 'E')) === 1),
        cond('FはDより右の席に座っている。', (o) => pos(o, 'F') > pos(o, 'D')),
      ],
      12,
    )
  },

  // 内訳：袋の玉。状態は [赤, 白, 青] の個数
  'nv-inference-011': (q) => {
    const states = tuples(3, 1, 7, (t) => sum(t) === 9)
    const conds: Cond<number[]>[] = [
      cond('赤玉は白玉より多い。', (s) => s[0] > s[1]),
      cond('青玉は白玉より1個多い。', (s) => s[2] === s[1] + 1),
    ]
    expectBullets(q, conds)
    expect(q.passage).toContain('合わせて9個')
    return multi(q, states, conds, (s) => `${s[0]}個`, 2)
  },

  // 内訳：注文。状態は [コーヒー, 紅茶, ジュース] の杯数
  'nv-inference-012': (q) => {
    const states = tuples(3, 1, 9, (t) => sum(t) === 11)
    const conds: Cond<number[]>[] = [
      cond('コーヒーは紅茶より多い。', (s) => s[0] > s[1]),
      cond('ジュースは紅茶より多い。', (s) => s[2] > s[1]),
      cond('コーヒーは5杯以下である。', (s) => s[0] <= 5),
    ]
    expectBullets(q, conds)
    expect(q.passage).toContain('合わせて11杯')
    return must(
      q,
      states,
      conds,
      [
        cond('紅茶は2杯以下である。', (s) => s[1] <= 2),
        cond('ジュースは4杯以上である。', (s) => s[2] >= 4),
        cond('コーヒーは3杯以上である。', (s) => s[0] >= 3),
      ],
      8,
    )
  },

  // g02：バラの本数として考えられるもの
  'nv-inference-013': (q) => {
    expectBullets(q, g02Conds)
    expect(q.passage).toContain('合わせて11本')
    return multi(q, flowerStates, g02Conds, (s) => `${s[0]}本`, 5)
  },

  // g02：本数が確定するのはどの情報か
  'nv-inference-014': (q) => {
    expectBullets(q, g02Conds)
    return determine(
      q,
      flowerStates,
      g02Conds,
      [
        cond('チューリップは6本以上である。', (s) => s[2] >= 6),
        cond('ユリは1本である。', (s) => s[1] === 1),
      ],
      (s) => s.join('-'),
      5,
    )
  },

  // 平均：3人の点数。状態は [A, B, C] の点数
  'nv-inference-015': (q) => {
    const states = tuples(3, 0, 100, (t) => sum(t) === 210)
    const conds: Cond<number[]>[] = [
      cond('3人の平均点は70点だった。', (s) => sum(s) === 210),
      cond('AはBより点数が低かった。', (s) => s[0] < s[1]),
      cond('BはCより点数が低かった。', (s) => s[1] < s[2]),
    ]
    expectBullets(q, conds)
    return must(q, states, conds, [
      cond('Bは70点である。', (s) => s[1] === 70),
      cond('Aは70点より低い。', (s) => s[0] < 70),
      cond('Cは71点以上である。', (s) => s[2] >= 71),
    ])
  },

  // 平均：4人の点数。状態は [P, Q, R, S] の点数
  'nv-inference-016': (q) => {
    const states = tuples(4, 0, 10)
    const count = (s: number[], v: number) => s.filter((x) => x === v).length
    const conds: Cond<number[]>[] = [
      cond('4人の平均点は6.5点だった。', (s) => sum(s) === 26),
      cond('最高点は9点で、9点をとったのはPだけだった。', (s) => Math.max(...s) === 9 && s[0] === 9 && count(s, 9) === 1),
      cond('最低点は4点で、4点をとったのはSだけだった。', (s) => Math.min(...s) === 4 && s[3] === 4 && count(s, 4) === 1),
      cond('QはRより点数が高かった。', (s) => s[1] > s[2]),
    ]
    expectBullets(q, conds)
    return multi(q, states, conds, (s) => `${s[1]}点`, 2)
  },

  // 平均：5人の点数（全員ちがう整数、10点満点）。状態は [A, B, C, D, E] の点数
  'nv-inference-017': (q) => {
    const states = tuples(5, 0, 10, (t) => new Set(t).size === 5)
    const conds: Cond<number[]>[] = [
      cond('5人の平均点は8点だった。', (s) => sum(s) === 40),
      cond('AとBの点数の差は1点だった。', (s) => Math.abs(s[0] - s[1]) === 1),
      cond('CはDより点数が高かった。', (s) => s[2] > s[3]),
      cond('EはCより点数が高かった。', (s) => s[4] > s[2]),
    ]
    expectBullets(q, conds)
    return multi(q, states, conds, (s) => `${s[3]}点`, 8)
  },

  // 発言：3人のうち1人がうそ。状態は「食べた人」
  'nv-inference-018': (q) => {
    const said: Said<string>[] = [
      { who: 'A', text: '私は食べていない。', holds: (c) => c !== 'A' },
      { who: 'B', text: '食べたのはAだ。', holds: (c) => c === 'A' },
      { who: 'C', text: 'Bは食べていない。', holds: (c) => c !== 'B' },
    ]
    expectSaid(q, said)
    expect(q.passage).toContain('うそをついているのは1人だけ')
    const exactlyOneLiar = cond('うそをついているのは1人だけ', (c: string) => said.filter((x) => !x.holds(c)).length === 1)
    return must(
      q,
      NAMES_3,
      [exactlyOneLiar],
      [
        cond('食べたのはAである。', (c) => c === 'A'),
        cond('Bはうそをついていない。', (c) => said[1].holds(c)),
        cond('Cは本当のことを言っている。', (c) => said[2].holds(c)),
      ],
      2,
    )
  },

  // 発言：正直者とうそつき。状態は [A, B, C, D] が正直者か
  'nv-inference-019': (q) => {
    const names = ['A', 'B', 'C', 'D']
    const said: Said<boolean[]>[] = [
      { who: 'A', text: 'Bはうそつきです。', holds: (h) => !h[1] },
      { who: 'B', text: 'AとCは同じ種類の人です。', holds: (h) => h[0] === h[2] },
      { who: 'C', text: 'Dはうそつきです。', holds: (h) => !h[3] },
      { who: 'D', text: 'Cはうそつきです。', holds: (h) => !h[2] },
    ]
    expectSaid(q, said)
    const states = tuples(4, 0, 1).map((t) => t.map((v) => v === 1))
    // 正直者の発言は本当、うそつきの発言はうそ
    const consistent = cond('正直者は本当のことを、うそつきはうそを言う', (h: boolean[]) => said.every((x, i) => x.holds(h) === h[i]))
    return multi(q, states, [consistent], (h) => names.filter((_, i) => h[i]), 2)
  },

  // 発言：5人のうち3人が本当。状態は「なくした人」
  'nv-inference-020': (q) => {
    const said: Said<string>[] = [
      { who: 'A', text: '私はなくしていない。', holds: (c) => c !== 'A' },
      { who: 'B', text: 'なくしたのはAだ。', holds: (c) => c === 'A' },
      { who: 'C', text: 'なくしたのはBだ。', holds: (c) => c === 'B' },
      { who: 'D', text: 'Eはなくしていない。', holds: (c) => c !== 'E' },
      { who: 'E', text: 'なくしたのはDだ。', holds: (c) => c === 'D' },
    ]
    expectSaid(q, said)
    expect(q.passage).toContain('本当のことを言っているのは3人だけ')
    const threeTruths = cond('本当のことを言っているのは3人だけ', (c: string) => said.filter((x) => x.holds(c)).length === 3)
    return must(
      q,
      NAMES_5,
      [threeTruths],
      [
        cond('Aは本当のことを言っている。', (c) => said[0].holds(c)),
        cond('Bはうそをついている。', (c) => !said[1].holds(c)),
        cond('Cは鍵をなくしていない。', (c) => c !== 'C'),
      ],
      2,
    )
  },
}

// ---------- テスト本体 ----------

describe('推論の問題（nv-inference）', () => {
  it('問題が15問以上ある', () => {
    expect(questions.length).toBeGreaterThanOrEqual(15)
  })

  it('全問に検証関数がある（検証漏れがない）', () => {
    const keys = questions.map((q) => q.key)
    const missing = keys.filter((k) => !(k in verifiers))
    const orphan = Object.keys(verifiers).filter((k) => !keys.includes(k))
    expect(missing, '検証関数がない問題').toEqual([])
    expect(orphan, '対応する問題がない検証関数').toEqual([])
  })

  describe('総当たりで正解を確かめる', () => {
    for (const q of questions) {
      it(`${q.key}: 全パターンを調べた正解が answer と一致する`, () => {
        const verify = verifiers[q.key]
        expect(verify, `${q.key} の検証関数`).toBeTypeOf('function')
        const { answer } = verify(q)
        expect(answer, `${q.key} の answer`).toEqual(q.answer)
      })

      it(`${q.key}: 形式と解説の書き方が決まりどおり`, () => {
        expect(q.topic).toBe('nv-inference')
        expect(q.passage, '推論は前提条件を passage に書く').toBeTruthy()
        expect(q.hint).toBeTruthy()
        // 解説の最後は「答え: <正解>」で、正解の選択肢と完全に同じ文字列
        const choices = q.choices ?? []
        const correct = Array.isArray(q.answer) ? q.answer.map((i) => choices[i]).join('、') : choices[q.answer as number]
        expect(q.explanation[q.explanation.length - 1]).toBe(`答え: ${correct}`)
        // multi の選択肢は「ラベルが重複しない」「answer は昇順」（validate.ts でも見るが、ここでも確認）
        if (q.format === 'multi') {
          const a = q.answer as number[]
          expect([...a].sort((x, y) => x - y)).toEqual(a)
        }
      })
    }
  })

  it('組問題は passage と groupKey がそろっている', () => {
    const groups = new Map<string, AuthoredQuestion[]>()
    for (const q of questions) {
      if (!q.groupKey) continue
      groups.set(q.groupKey, [...(groups.get(q.groupKey) ?? []), q])
    }
    expect(groups.size).toBeGreaterThan(0)
    for (const [key, qs] of groups) {
      expect(qs.length, `${key} は2問以上`).toBeGreaterThanOrEqual(2)
      for (const q of qs) expect(q.passage, `${q.key} の passage が組の先頭と同じ`).toBe(qs[0].passage)
    }
  })

  describe('解き方ノートの例題も総当たりで確かめる', () => {
    // 例題は問題文（前提＋問い）が1つの文字列なので、同じ文字列を passage と stem の両方に入れて同じ検査にかける
    const examples = noteExamples(note)
    const asQuestion = (
      key: string,
      stem: string,
      format: 'single' | 'multi',
      choices: string[],
      answer: number | number[],
    ): AuthoredQuestion => ({
      key,
      topic: 'nv-inference',
      difficulty: 1,
      format,
      passage: stem,
      stem,
      choices,
      answer,
      explanation: [],
    })
    const asMust = (i: number) => {
      const e = examples[i]
      expect(MUST_CHOICES, `型${i + 1} の答え`).toContain(e.answer)
      return asQuestion(`note-example-${i + 1}`, e.stem, 'single', MUST_CHOICES, MUST_CHOICES.indexOf(e.answer))
    }
    const asDetermine = (i: number) => {
      const e = examples[i]
      expect(DETERMINE_CHOICES, `型${i + 1} の答え`).toContain(e.answer)
      return asQuestion(`note-example-${i + 1}`, e.stem, 'single', DETERMINE_CHOICES, DETERMINE_CHOICES.indexOf(e.answer))
    }
    const ABCD = permutations(['A', 'B', 'C', 'D'])

    // 型の並び（タイトルの先頭）と検証のしかたを1対1で対応させる
    const verifiers: [string, () => void][] = [
      [
        '順序・順位の問題（必ず正しいもの）',
        () => {
          const q = asMust(0)
          const conds: Cond<Order>[] = [
            cond('QはPより先に着いた。', (o) => pos(o, 'Q') < pos(o, 'P')),
            cond('QはRより先に着いた。', (o) => pos(o, 'Q') < pos(o, 'R')),
            cond('SはRより先に着いた。', (o) => pos(o, 'S') < pos(o, 'R')),
          ]
          expectBullets(q, conds)
          const claims: Cond<Order>[] = [
            cond('Qは1位である。', (o) => pos(o, 'Q') === 1),
            cond('Sは3位以内に着いた。', (o) => pos(o, 'S') <= 3),
            cond('PはRより後に着いた。', (o) => pos(o, 'P') > pos(o, 'R')),
          ]
          expect(must(q, P4, conds, claims, 5).answer).toBe(q.answer)
        },
      ],
      [
        '順序・順位の問題（「直前」と考えられる順位）',
        () => {
          const e = examples[1]
          const choices = ['1位', '2位', '3位', '4位']
          const expected = choices.flatMap((c, i) => (e.answer.includes(c) ? [i] : []))
          const q = asQuestion('note-example-2', e.stem, 'multi', choices, expected)
          const conds: Cond<Order>[] = [
            cond('PはQより先に着いた。', (o) => pos(o, 'P') < pos(o, 'Q')),
            cond('SはRの直前に着いた。', (o) => pos(o, 'S') + 1 === pos(o, 'R')),
          ]
          expectBullets(q, conds)
          expect(multi(q, P4, conds, (o) => `${pos(o, 'Q')}位`, 3).answer).toEqual(expected)
        },
      ],
      [
        '順序・順位の問題（確定するには）',
        () => {
          const q = asDetermine(2)
          // 並びは「高い順」
          const conds: Cond<Order>[] = [
            cond('QはPより低い。', (o) => pos(o, 'Q') > pos(o, 'P')),
            cond('RはPより低い。', (o) => pos(o, 'R') > pos(o, 'P')),
            cond('SはQより低い。', (o) => pos(o, 'S') > pos(o, 'Q')),
          ]
          expectBullets(q, conds)
          const infos: [Cond<Order>, Cond<Order>] = [
            cond('Rは最も低い人ではない。', (o) => pos(o, 'R') !== 4),
            cond('Qは2番目に高い。', (o) => pos(o, 'Q') === 2),
          ]
          expect(determine(q, P4, conds, infos, (o) => o.join(), 3).answer).toBe(q.answer)
        },
      ],
      [
        '位置の問題',
        () => {
          const q = asMust(3)
          // 並びの添字 + 1 = 席の番号（左から1番）
          const conds: Cond<Order>[] = [
            cond('AとBは隣り合っている。', (o) => Math.abs(pos(o, 'A') - pos(o, 'B')) === 1),
            cond('CはAより左の席に座っている。', (o) => pos(o, 'C') < pos(o, 'A')),
            cond('DはBより左の席に座っている。', (o) => pos(o, 'D') < pos(o, 'B')),
          ]
          expectBullets(q, conds)
          const claims: Cond<Order>[] = [
            cond('Aは3番か4番に座っている。', (o) => pos(o, 'A') >= 3),
            cond('CはDの隣に座っている。', (o) => Math.abs(pos(o, 'C') - pos(o, 'D')) === 1),
            cond('Cは1番に座っている。', (o) => pos(o, 'C') === 1),
          ]
          expect(must(q, ABCD, conds, claims, 4).answer).toBe(q.answer)
        },
      ],
      [
        '内訳の問題',
        () => {
          const q = asMust(4)
          expect(q.stem).toContain('合わせて10個')
          expect(q.stem).toContain('どの色の玉も1個以上')
          // [赤, 白, 青]、どれも1個以上で合計10個
          const states = tuples(3, 1, 10, (t) => sum(t) === 10)
          const conds: Cond<number[]>[] = [
            cond('赤玉は白玉より多い。', ([r, w]) => r > w),
            cond('青玉は白玉より1個多い。', ([, w, b]) => b === w + 1),
          ]
          expectBullets(q, conds)
          const claims: Cond<number[]>[] = [
            cond('赤玉は5個以上である。', ([r]) => r >= 5),
            cond('青玉は赤玉より多い。', ([r, , b]) => b > r),
            cond('白玉は2個以下である。', ([, w]) => w <= 2),
          ]
          expect(must(q, states, conds, claims, 2).answer).toBe(q.answer)
        },
      ],
      [
        '平均・整数の問題',
        () => {
          const q = asMust(5)
          expect(q.stem).toContain('100点満点')
          // [A, B, C]、0〜100点の整数
          const states = tuples(3, 0, 100, (t) => sum(t) === 240)
          const conds: Cond<number[]>[] = [
            cond('3人の平均点は80点だった。', (t) => sum(t) / 3 === 80),
            cond('AはBより点数が低かった。', ([a, b]) => a < b),
            cond('BはCより点数が低かった。', ([, b, c]) => b < c),
          ]
          expectBullets(q, conds)
          const claims: Cond<number[]>[] = [
            cond('Bは80点である。', ([, b]) => b === 80),
            cond('Aは80点より低い。', ([a]) => a < 80),
            cond('Cは81点以上である。', ([, , c]) => c >= 81),
          ]
          expect(must(q, states, conds, claims).answer).toBe(q.answer)
        },
      ],
      [
        '発言の正誤の問題',
        () => {
          const q = asMust(6)
          const said: Said<string>[] = [
            { who: 'A', text: '割ったのはBだ。', holds: (c) => c === 'B' },
            { who: 'B', text: '私は割っていない。', holds: (c) => c !== 'B' },
            { who: 'C', text: '割ったのはAだ。', holds: (c) => c === 'A' },
          ]
          expectSaid(q, said)
          expect(q.stem).toContain('うそをついているのは1人だけ')
          const oneLiar = cond('うそをついているのは1人だけ', (c: string) => said.filter((x) => !x.holds(c)).length === 1)
          const claims: Cond<string>[] = [
            cond('割ったのはAである。', (c) => c === 'A'),
            cond('Bはうそをついている。', (c) => !said[1].holds(c)),
            cond('Cはうそをついている。', (c) => !said[2].holds(c)),
          ]
          expect(must(q, NAMES_3, [oneLiar], claims, 1).answer).toBe(q.answer)
        },
      ],
    ]

    it('ノートのすべての型の例題に検証がある', () => {
      expect(examples.length).toBe(verifiers.length)
      note.patterns.forEach((p, i) => expect(p.title.startsWith(verifiers[i][0]), p.title).toBe(true))
    })

    verifiers.forEach(([title, verify], i) => {
      it(`型${i + 1}（${title}）: 総当たりの正解と一致する`, verify)
    })
  })

  it('難易度・形式・種類にかたよりがない', () => {
    const count = (f: (q: AuthoredQuestion) => boolean) => questions.filter(f).length
    // 難易度 1:2:3 = 3:4:3 を目安に、どれも2割以上
    for (const d of [1, 2, 3]) {
      expect(count((q) => q.difficulty === d), `難易度${d}の問題数`).toBeGreaterThanOrEqual(Math.floor(questions.length * 0.2))
    }
    // 「必ず正しい」「すべて選ぶ」「確定」の3形式がそろっている
    expect(count((q) => q.format === 'multi')).toBeGreaterThanOrEqual(3)
    expect(count((q) => q.format === 'single' && q.choices?.length === 8)).toBeGreaterThanOrEqual(3)
    expect(count((q) => q.format === 'single' && q.choices?.length === 5 && q.choices[0].startsWith('カ'))).toBeGreaterThanOrEqual(2)
  })
})
