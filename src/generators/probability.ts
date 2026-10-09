import type { Generator } from '../types'
import { defineGenerator, retry, type GeneratedBody } from './common'
import { balancedPick, type Item } from './balanced-choices'
import type { Rng } from '../lib/rng'
import { comb, factorial, frac, gcd, perm, rawFrac, reduce } from '../lib/math'

// 確率
//
// 各「型」は、乱数で数字を決める部分（draw）と、問題文・選択肢・解説を作る部分（build）に分けてある。
// 独自テスト（probability.test.ts）が draw の結果から、全部の場合を書き出して数え直し、正解と照らし合わせる。
// 確率の答えは約分した分数 "{{5/36}}" で、選択肢は値の小さい順に並べる。

type Meta = Parameters<typeof defineGenerator>[0]

export type Spec<P> = {
  generator: Generator
  draw: (rng: Rng) => P
  build: (p: P, rng: Rng) => GeneratedBody
}

function spec<P>(meta: Meta, draw: (rng: Rng) => P, build: (p: P, rng: Rng) => GeneratedBody): Spec<P> {
  return { generator: defineGenerator(meta, (rng) => build(draw(rng), rng)), draw, build }
}

// ---- 分数の小道具 ----

/** [分子, 分母]（約分していない形も含む） */
type Fr = [number, number]

const raw = (f: Fr) => rawFrac(f[0], f[1])
const mulF = (a: Fr, b: Fr): Fr => [a[0] * b[0], a[1] * b[1]]
const notF = (a: Fr): Fr => [a[1] - a[0], a[1]] // 1 − a
const addF = (a: Fr, b: Fr): Fr => [a[0] * b[1] + b[0] * a[1], a[1] * b[1]]

/** 約分の途中式。例: "{{6/36}} = {{1/6}}（分子と分母を6で割って約分する）" */
function reduceStep(n: number, d: number): string {
  const g = gcd(n, d)
  const [rn, rd] = reduce(n, d)
  return g === 1
    ? `${rawFrac(n, d)}（これ以上約分できない）`
    : `${rawFrac(n, d)} = ${rawFrac(rn, rd)}（分子と分母を${g}で割って約分する）`
}

/** 約分できるときだけ「約分する」ステップを返す（約分できないときは空） */
function reduceSteps(n: number, d: number): string[] {
  return gcd(n, d) === 1 ? [] : [`約分する。${reduceStep(n, d)}`]
}

const down = (n: number, r: number) => Array.from({ length: r }, (_, i) => n - i)
const upTo = (r: number) => Array.from({ length: r }, (_, i) => r - i)
const times = (xs: number[]) => xs.join(' × ')

/** 例: "5C2 = (5 × 4) ÷ (2 × 1) = 20 ÷ 2 = 10" */
const combLine = (n: number, r: number) =>
  r <= 1
    ? `${n}C${r} = ${comb(n, r)}`
    : `${n}C${r} = (${times(down(n, r))}) ÷ (${times(upTo(r))}) = ${perm(n, r)} ÷ ${factorial(r)} = ${comb(n, r)}`

/**
 * 確率の選択肢を作る。n/d が正解（d は約分前の「全部の場合の数」にしておくと、埋め草が自然な分母になる）。
 * wrongs は「よくある間違い方で出る値」を優先度の高い順に並べたもの。優先度の高いものから選択肢に入る。
 * 0以下・1以上の値と、正解や互いに同じになる値は自動で除く。
 * 足りなければ、正解の近くの分数（分母を2倍・3倍…にしたものを含む）で埋める。
 * 正解の位置が偏らないよう、balancedPick が位置を散らす。
 */
function probChoices(rng: Rng, n: number, d: number, wrongs: Fr[]) {
  const mk = (a: number, b: number): Item | null => {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0 || a >= b) return null
    return { label: frac(a, b), value: a / b }
  }
  const correct: Item = { label: frac(n, d), value: n / d }
  const cands = wrongs.map(([a, b]) => mk(a, b)).filter((x): x is Item => x !== null)
  // 埋め草: 分母は d のまま分子を前後にずらした値を優先し（例: 5/36 の近くなら 4/36、6/36、7/36…）、
  // 足りないときだけ分母を2倍・3倍…にして探す。同じ分母の中では正解に近い順に並べる
  const pads: (Item & { m: number })[] = []
  const padSeen = new Set<string>([correct.label])
  for (let m = 1; m <= 6; m++) {
    for (let k = 1; k <= 12; k++) {
      for (const x of [n * m + k, n * m - k]) {
        const it = mk(x, d * m)
        if (it && !padSeen.has(it.label)) {
          padSeen.add(it.label)
          pads.push({ ...it, m })
        }
      }
    }
  }
  pads.sort((p, q) => p.m - q.m || Math.abs(p.value - correct.value) - Math.abs(q.value - correct.value))
  return balancedPick(
    rng,
    correct,
    cands,
    pads.filter((p) => p.value < correct.value),
    pads.filter((p) => p.value > correct.value),
  )
}

// ---------------------------------------------------------------------------
// サイコロ2個の目の出方（共通）

type Pair = [number, number]
const PAIRS36: Pair[] = []
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) PAIRS36.push([a, b])
const pairText = (ps: Pair[]) => ps.map(([a, b]) => `(${a}, ${b})`).join('、')

function diceBody(
  rng: Rng,
  ctx: number,
  question: string,
  notDesc: string,
  hint: string,
  pred: (a: number, b: number) => boolean,
): GeneratedBody {
  const [l1, l2] = ctx === 0 ? ['大', '小'] : ['赤', '青']
  const intro = ctx === 0 ? '大小2個のサイコロを同時に投げる。' : '赤と青の2個のサイコロを同時に投げる。'
  const fav = PAIRS36.filter(([a, b]) => pred(a, b))
  const comp = PAIRS36.filter(([a, b]) => !pred(a, b))
  const cnt = fav.length
  const unordered = new Set(fav.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)).size

  const { choices, answer } = probChoices(rng, cnt, 36, [
    [36 - cnt, 36], // 反対の条件の確率を答えた
    [unordered, 36], // (1,6) と (6,1) を同じと数えた
    [cnt, 12], // 分母を 6 + 6 にした
    [cnt, 6], // 分母を 6 にした
    [cnt - 1, 36],
    [cnt + 1, 36],
    [cnt, 21],
  ])

  const steps = [`サイコロ2個の目の出方は、6 × 6 = 36通り。以下、（${l1}の目, ${l2}の目）の形で書き出して数える。`]
  if (cnt <= 16) {
    steps.push(`条件に合う目の出方は、${pairText(fav)} の${cnt}通り。`)
  } else {
    steps.push(`数えやすいように、条件に合わない方（${notDesc}）を書き出す。${pairText(comp)} の${comp.length}通り。`)
    steps.push(`条件に合う目の出方は、36 − ${comp.length} = ${cnt}通り。`)
  }
  steps.push(`確率 = 条件に合う目の出方 ÷ 全部の目の出方 = ${reduceStep(cnt, 36)}`)
  steps.push(`答え: ${frac(cnt, 36)}`)
  return { stem: `${intro}${question}`, choices, answer, hint, targetSec: 75, explanation: steps }
}

// ---------------------------------------------------------------------------
// 1. サイコロ2個（和・差） difficulty 1

export type DiceSumP = { kind: 'eq' | 'ge' | 'le' | 'mult' | 'diff'; k: number; ctx: number }

const diceSum = spec<DiceSumP>(
  { id: 'nv-probability/dice-sum', topic: 'nv-probability', difficulty: 1, label: 'サイコロ2個（目の和・差）' },
  (rng) => {
    const kind = rng.pick<DiceSumP['kind']>(['eq', 'eq', 'ge', 'le', 'mult', 'diff'])
    const k =
      kind === 'eq'
        ? rng.int(4, 10)
        : kind === 'ge'
          ? rng.int(9, 11)
          : kind === 'le'
            ? rng.int(3, 5)
            : kind === 'mult'
              ? rng.pick([3, 4, 5, 6])
              : rng.int(0, 3)
    return { kind, k, ctx: rng.int(0, 1) }
  },
  ({ kind, k, ctx }, rng) => {
    const q = {
      eq: `出る目の和が${k}になる確率を求めよ。`,
      ge: `出る目の和が${k}以上になる確率を求めよ。`,
      le: `出る目の和が${k}以下になる確率を求めよ。`,
      mult: `出る目の和が${k}の倍数になる確率を求めよ。`,
      diff: k === 0 ? '2個の目が同じになる確率を求めよ。' : `出る目の差（大きい方から小さい方を引いた数）が${k}になる確率を求めよ。`,
    }[kind]
    const pred = {
      eq: (a: number, b: number) => a + b === k,
      ge: (a: number, b: number) => a + b >= k,
      le: (a: number, b: number) => a + b <= k,
      mult: (a: number, b: number) => (a + b) % k === 0,
      diff: (a: number, b: number) => Math.abs(a - b) === k,
    }[kind]
    return diceBody(rng, ctx, q, '条件に合わない目の出方', '目の出方は全部で36通りです。条件に合う組を書き出して数え、36で割ります。', pred)
  },
)

// ---------------------------------------------------------------------------
// 2. サイコロ2個（積） difficulty 2

export type DiceProductP = { kind: 'even' | 'odd' | 'eq' | 'ge' | 'le' | 'mult'; k: number; ctx: number }

const diceProduct = spec<DiceProductP>(
  { id: 'nv-probability/dice-product', topic: 'nv-probability', difficulty: 2, label: 'サイコロ2個（目の積）' },
  (rng) => {
    const kind = rng.pick<DiceProductP['kind']>(['even', 'odd', 'eq', 'ge', 'le', 'mult'])
    const k =
      kind === 'eq'
        ? rng.pick([4, 6, 8, 9, 10, 12])
        : kind === 'ge'
          ? rng.pick([16, 20, 24])
          : kind === 'le'
            ? rng.pick([4, 6])
            : kind === 'mult'
              ? rng.pick([4, 6])
              : 0
    return { kind, k, ctx: rng.int(0, 1) }
  },
  ({ kind, k, ctx }, rng) => {
    const q = {
      even: '出る目の積が偶数になる確率を求めよ。',
      odd: '出る目の積が奇数になる確率を求めよ。',
      eq: `出る目の積が${k}になる確率を求めよ。`,
      ge: `出る目の積が${k}以上になる確率を求めよ。`,
      le: `出る目の積が${k}以下になる確率を求めよ。`,
      mult: `出る目の積が${k}の倍数になる確率を求めよ。`,
    }[kind]
    const pred = {
      even: (a: number, b: number) => (a * b) % 2 === 0,
      odd: (a: number, b: number) => (a * b) % 2 === 1,
      eq: (a: number, b: number) => a * b === k,
      ge: (a: number, b: number) => a * b >= k,
      le: (a: number, b: number) => a * b <= k,
      mult: (a: number, b: number) => (a * b) % k === 0,
    }[kind]
    const notDesc = kind === 'even' ? '積が奇数になる＝2個とも奇数の目' : '条件に合わない目の出方'
    return diceBody(
      rng,
      ctx,
      q,
      notDesc,
      kind === 'even'
        ? '「偶数」を直接数えると大変です。反対の「奇数」になる場合を数えて、全体から引くと楽です。'
        : '目の出方は全部で36通りです。条件に合う組を書き出して数え、36で割ります。',
      pred,
    )
  },
)

// ---------------------------------------------------------------------------
// 3. コイン（ちょうどk回） difficulty 1

export type CoinP = { n: number; k: number; side: string; ctx: number }

function sequences(n: number, k: number, a: string, b: string): string[] {
  const out: string[] = []
  const rec = (s: string, cnt: number) => {
    if (s.length === n) {
      if (cnt === k) out.push(s)
      return
    }
    rec(s + a, cnt + 1)
    rec(s + b, cnt)
  }
  rec('', 0)
  return out
}

const coin = spec<CoinP>(
  { id: 'nv-probability/coin', topic: 'nv-probability', difficulty: 1, label: 'コイン（ちょうどk回）' },
  (rng) => {
    const n = rng.int(3, 5)
    return { n, k: rng.int(1, n - 1), side: rng.pick(['表', '裏']), ctx: rng.int(0, 1) }
  },
  ({ n, k, side, ctx }, rng) => {
    const other = side === '表' ? '裏' : '表'
    const unit = ctx === 0 ? '回' : '枚'
    const total = 2 ** n
    const list = sequences(n, k, side, other)
    const cnt = list.length // = nCk
    const stem =
      ctx === 0
        ? `1枚のコインを${n}回続けて投げる。${side}がちょうど${k}回出る確率を求めよ。`
        : `${n}枚のコインを同時に投げる。コインを1枚ずつ区別して考えるとき、${side}がちょうど${k}枚になる確率を求めよ。`
    const { choices, answer } = probChoices(rng, cnt, total, [
      [1, total], // 1通りしか数えなかった
      [k, total],
      [cnt, 2 * n], // 分母を 2 × 回数 にした
      [k, n],
      [cnt + 1, total],
      [cnt - 1, total],
    ])
    return {
      stem,
      choices,
      answer,
      targetSec: 75,
      hint: `表裏の出方は全部で2のn乗通りです。${side}が${k}${unit}になる並びを書き出して、数えます。`,
      explanation: [
        `コインの表裏の出方は、${Array(n).fill(2).join(' × ')} = ${total}通り。`,
        `${side}がちょうど${k}${unit}になる出方を書き出す。${list.join('、')} の${cnt}通り。`,
        `これは「${n}${unit}のうち${side}になる${unit}を${k}つ選ぶ」選び方と同じなので、${combLine(n, k)} でも求められる。`,
        `確率 = 条件に合う出方 ÷ 全部の出方 = ${reduceStep(cnt, total)}`,
        `答え: ${frac(cnt, total)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 4・5. 独立な2つの出来事

const PROBS: Fr[] = [
  [1, 2],
  [1, 3],
  [2, 3],
  [1, 4],
  [3, 4],
  [1, 5],
  [2, 5],
  [3, 5],
  [4, 5],
]

const SETTINGS = [
  {
    setup: (p: Fr, q: Fr) =>
      `Aさんが採用試験に合格する確率は${raw(p)}、Bさんが合格する確率は${raw(q)}である。2人の合否は互いに影響しない。`,
    okA: 'Aさんが合格する',
    ngA: 'Aさんが合格しない',
    okB: 'Bさんが合格する',
    ngB: 'Bさんが合格しない',
    both: '2人とも合格する確率',
    neither: '2人とも合格しない確率',
    atLeast: '少なくとも1人が合格する確率',
    exactly: 'ちょうど1人だけが合格する確率',
    pos: '合格する',
  },
  {
    setup: (p: Fr, q: Fr) =>
      `選手Aがシュートを決める確率は${raw(p)}、選手Bが決める確率は${raw(q)}である。2人が1本ずつシュートを打つ。`,
    okA: 'Aが決める',
    ngA: 'Aが外す',
    okB: 'Bが決める',
    ngB: 'Bが外す',
    both: '2人とも決める確率',
    neither: '2人とも外す確率',
    atLeast: '少なくとも1人が決める確率',
    exactly: 'ちょうど1人だけが決める確率',
    pos: '決める',
  },
  {
    setup: (p: Fr, q: Fr) =>
      `ある日、A市で雨が降る確率は${raw(p)}、B市で雨が降る確率は${raw(q)}である。2つの市の天気は互いに影響しないものとする。`,
    okA: 'A市で雨が降る',
    ngA: 'A市で雨が降らない',
    okB: 'B市で雨が降る',
    ngB: 'B市で雨が降らない',
    both: '2つの市とも雨が降る確率',
    neither: 'どちらの市でも雨が降らない確率',
    atLeast: '少なくとも一方の市で雨が降る確率',
    exactly: 'ちょうど一方の市だけで雨が降る確率',
    pos: '雨が降る',
  },
]

function drawPair(rng: Rng): { p: Fr; q: Fr; ctx: number } {
  const [p, q] = retry(
    rng,
    (r) => [r.pick(PROBS), r.pick(PROBS)] as [Fr, Fr],
    ([a, b]) => a[0] !== b[0] || a[1] !== b[1],
  )
  return { p, q, ctx: rng.int(0, SETTINGS.length - 1) }
}

export type IndependentAndP = { p: Fr; q: Fr; ctx: number; mode: 'both' | 'neither' }

const independentAnd = spec<IndependentAndP>(
  { id: 'nv-probability/independent-and', topic: 'nv-probability', difficulty: 1, label: '独立な2つの出来事（どちらも）' },
  (rng) => ({ ...drawPair(rng), mode: rng.pick<IndependentAndP['mode']>(['both', 'neither']) }),
  ({ p, q, ctx, mode }, rng) => {
    const s = SETTINGS[ctx]
    const np = notF(p)
    const nq = notF(q)
    const both = mulF(p, q)
    const neither = mulF(np, nq)
    const atLeast = notF(reduce(neither[0], neither[1]) as Fr)
    const target = mode === 'both' ? both : neither
    const cond = mode === 'both' ? s.both : s.neither
    const wrong: Fr[] =
      mode === 'both'
        ? [neither, mulF(p, nq), mulF(np, q), notF(both), addF(p, q), atLeast]
        : [both, notF(both), mulF(p, nq), mulF(np, q), atLeast]
    const { choices, answer } = probChoices(rng, target[0], target[1], wrong)
    const explanation =
      mode === 'both'
        ? [
            '2つの出来事は互いに影響しない（独立）ので、「両方が起こる」確率は、それぞれの確率をかけ算して求める。',
            `${cond} = ${raw(p)} × ${raw(q)} = ${raw(both)}（分子どうし、分母どうしをかける）`,
            ...reduceSteps(both[0], both[1]),
            `答え: ${frac(both[0], both[1])}`,
          ]
        : [
            '2つの出来事は互いに影響しないので、「両方が起こらない」確率は、起こらない確率どうしをかけ算して求める。',
            `「${s.ngA}」確率 = 1 − ${raw(p)} = ${raw(np)}、「${s.ngB}」確率 = 1 − ${raw(q)} = ${raw(nq)}`,
            `${cond} = ${raw(np)} × ${raw(nq)} = ${raw(neither)}（分子どうし、分母どうしをかける）`,
            ...reduceSteps(neither[0], neither[1]),
            `答え: ${frac(neither[0], neither[1])}`,
          ]
    return {
      stem: `${s.setup(p, q)}${cond}を求めよ。`,
      choices,
      answer,
      targetSec: 60,
      hint: '互いに影響しない2つの出来事が両方起こる確率は、それぞれの確率のかけ算です。「起こらない確率」は 1 から引いて求めます。',
      explanation,
    }
  },
)

export type IndependentOrP = { p: Fr; q: Fr; ctx: number; mode: 'atLeast' | 'exactly' }

const independentOr = spec<IndependentOrP>(
  { id: 'nv-probability/independent-or', topic: 'nv-probability', difficulty: 2, label: '独立な2つの出来事（少なくとも・ちょうど）' },
  (rng) => ({ ...drawPair(rng), mode: rng.pick<IndependentOrP['mode']>(['atLeast', 'exactly']) }),
  ({ p, q, ctx, mode }, rng) => {
    const s = SETTINGS[ctx]
    const np = notF(p)
    const nq = notF(q)
    const both = mulF(p, q)
    const neither = mulF(np, nq)
    const [rn, rd] = reduce(neither[0], neither[1])
    const atLeast = notF([rn, rd])
    const onlyA = mulF(p, nq)
    const onlyB = mulF(np, q)
    const exactly: Fr = [onlyA[0] + onlyB[0], onlyA[1]] // 2つの分母は同じ（p,qの分母の積）
    const neitherPhrase = s.neither.replace(/確率$/, '')

    if (mode === 'atLeast') {
      const { choices, answer } = probChoices(rng, neither[1] - neither[0], neither[1], [
        both, // 両方の確率だけを答えた
        addF(p, q), // 足し算にした（両方の場合を2回数えている）
        notF(both), // 「少なくとも1人が失敗」の確率
        neither,
        exactly,
      ])
      return {
        stem: `${s.setup(p, q)}${s.atLeast}を求めよ。`,
        choices,
        answer,
        targetSec: 75,
        hint: '「少なくとも1人」の反対は「だれも〜ない」です。反対の確率を求めて、1から引きます。',
        explanation: [
          `「少なくとも1つ」を直接数えると場合が多い。反対の「${neitherPhrase}」確率を求めて、全体の確率1から引く（余事象）。`,
          `「${s.ngA}」確率 = 1 − ${raw(p)} = ${raw(np)}、「${s.ngB}」確率 = 1 − ${raw(q)} = ${raw(nq)}`,
          `${s.neither} = ${raw(np)} × ${raw(nq)} = ${raw(neither)}（分子どうし、分母どうしをかける）`,
          ...reduceSteps(neither[0], neither[1]),
          `${s.atLeast} = 1 − ${raw([rn, rd])} = ${raw(atLeast)}`,
          `答え: ${frac(atLeast[0], atLeast[1])}`,
        ],
      }
    }

    const { choices, answer } = probChoices(rng, exactly[0], exactly[1], [
      addF(p, q), // 両方起こる場合も2回数えた
      both,
      notF(both),
      atLeast,
      neither,
      onlyA,
    ])
    return {
      stem: `${s.setup(p, q)}${s.exactly}を求めよ。`,
      choices,
      answer,
      targetSec: 75,
      hint: '「Aだけ」と「Bだけ」の2つの場合に分け、それぞれの確率を求めて足します。',
      explanation: [
        '「ちょうど1つだけ」は、「Aだけ起こる」場合と「Bだけ起こる」場合の2つ。この2つは同時には起こらないので、それぞれの確率を足し算する。',
        `「${s.okA}」かつ「${s.ngB}」: ${raw(p)} × ${raw(nq)} = ${raw(onlyA)}`,
        `「${s.ngA}」かつ「${s.okB}」: ${raw(np)} × ${raw(q)} = ${raw(onlyB)}`,
        `足し算する（分母が同じなので分子を足す）。${raw(onlyA)} + ${raw(onlyB)} = ${raw(exactly)}`,
        ...reduceSteps(exactly[0], exactly[1]),
        `答え: ${frac(exactly[0], exactly[1])}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 6. 玉を同時に2個取り出す difficulty 2

export type BallsP = { mode: 'bothFirst' | 'same' | 'oneEach' | 'same3'; counts: number[]; colors: string[] }

const COLORS = ['赤', '白', '青', '黄', '黒']

const balls = spec<BallsP>(
  { id: 'nv-probability/balls', topic: 'nv-probability', difficulty: 2, label: '玉を同時に2個取り出す' },
  (rng) => {
    const mode = rng.pick<BallsP['mode']>(['bothFirst', 'same', 'oneEach', 'same3'])
    const colors = rng.shuffle(COLORS).slice(0, mode === 'same3' ? 3 : 2)
    const counts =
      mode === 'same3'
        ? retry(
            rng,
            (r) => [r.int(2, 4), r.int(2, 4), r.int(2, 3)],
            (c) => c[0] + c[1] + c[2] <= 10,
          )
        : [rng.int(2, 5), rng.int(2, 5)]
    return { mode, counts, colors }
  },
  ({ mode, counts, colors }, rng) => {
    const n = counts.reduce((x, y) => x + y, 0)
    const D = comb(n, 2)
    const [r, w] = counts
    const b = counts[2] ?? 0
    const [c0, c1] = colors
    const num =
      mode === 'bothFirst' ? comb(r, 2) : mode === 'oneEach' ? r * w : counts.reduce((s, c) => s + comb(c, 2), 0)
    const bag = counts.map((c, i) => `${colors[i]}玉が${c}個`).join('、')
    const question = {
      bothFirst: `2個とも${c0}玉である確率を求めよ。`,
      same: '取り出した2個が同じ色である確率を求めよ。',
      oneEach: `${c0}玉と${c1}玉が1個ずつである確率を求めよ。`,
      same3: '取り出した2個が同じ色である確率を求めよ。',
    }[mode]
    const wrong: Fr[] = {
      bothFirst: [[r * r, n * n], [comb(r, 2), n * (n - 1)], [r, n], [comb(w, 2), D], [r * (r - 1), D]] as Fr[],
      same: [[comb(r, 2), D], [r * r + w * w, n * n], [num, n * (n - 1)], [r * w, D], [comb(w, 2), D]] as Fr[],
      oneEach: [[r * w, n * (n - 1)], [r * w, n * n], [comb(r, 2) + comb(w, 2), D], [2 * r * w, D], [r + w, D]] as Fr[],
      same3: [
        [comb(r, 2), D],
        [r * r + w * w + b * b, n * n],
        [num, n * (n - 1)],
        [r * w + w * b + b * r, D],
        [comb(r, 2) + comb(w, 2), D],
      ] as Fr[],
    }[mode]
    const { choices, answer } = probChoices(rng, num, D, wrong)

    const middle =
      mode === 'bothFirst'
        ? [`${c0}玉${r}個から2個を選ぶ取り出し方: ${combLine(r, 2)}`]
        : mode === 'oneEach'
          ? [
              `${c0}玉${r}個から1個を選ぶのは${r}通り、${c1}玉${w}個から1個を選ぶのは${w}通り。「かつ」はかけ算なので ${r} × ${w} = ${num}通り`,
            ]
          : [
              ...counts.map((c, i) => `${colors[i]}玉${c}個から2個を選ぶ取り出し方: ${combLine(c, 2)}`),
              `「どれか1色の2個」なので足し算する。${counts.map((c) => comb(c, 2)).join(' + ')} = ${num}通り`,
            ]
    return {
      stem: `袋の中に、${bag}の合計${n}個が入っている。この袋から玉を同時に2個取り出す。${question}`,
      choices,
      answer,
      targetSec: 90,
      hint: '同時に取り出すので順番は関係ありません。「全部の取り出し方」と「条件に合う取り出し方」をそれぞれ組合せで数えて割ります。',
      explanation: [
        '同時に取り出すので、順番は関係ない。「全部の取り出し方」と「条件に合う取り出し方」を組合せで数えて、割り算する。',
        `全部の取り出し方（${n}個から2個）: ${combLine(n, 2)}`,
        ...middle,
        `確率 = 条件に合う取り出し方 ÷ 全部の取り出し方 = ${reduceStep(num, D)}`,
        `答え: ${frac(num, D)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 7. くじを順に引く（戻さない） difficulty 2

export type LotsP = { mode: 'both' | 'missHit' | 'exactlyOne' | 'second' | 'three'; n: number; a: number }

const lots = spec<LotsP>(
  { id: 'nv-probability/lots', topic: 'nv-probability', difficulty: 2, label: 'くじを順に引く（戻さない）' },
  (rng) => {
    const mode = rng.pick<LotsP['mode']>(['both', 'missHit', 'exactlyOne', 'second', 'three'])
    if (mode === 'three') {
      const n = rng.int(6, 8)
      return { mode, n, a: rng.int(3, Math.min(5, n - 2)) }
    }
    const n = rng.int(6, 10)
    return { mode, n, a: rng.int(2, Math.min(4, n - 2)) }
  },
  ({ mode, n, a }, rng) => {
    const D = n * (n - 1)
    const people = mode === 'three' ? 'A、B、Cの3人' : 'AとBの2人'
    const question = {
      both: '2人とも当たる確率を求めよ。',
      missHit: 'Aがはずれ、Bが当たる確率を求めよ。',
      exactlyOne: 'ちょうど1人だけが当たる確率を求めよ。',
      second: 'Bが当たる確率を求めよ。（Aが当たったかどうかは問わない）',
      three: '3人とも当たる確率を求めよ。',
    }[mode]
    const stem = `${n}本のくじの中に、当たりが${a}本入っている。${people}がこの順に1本ずつ引く。引いたくじは元に戻さないものとする。${question}`

    let target: Fr
    let wrong: Fr[]
    let steps: string[]
    switch (mode) {
      case 'both':
        target = [a * (a - 1), D]
        wrong = [[a * a, n * n], [a * (a - 1), n * n], [a * a, D], [a - 1, n - 1], [a, n]]
        steps = [
          `Aが当たる確率は ${rawFrac(a, n)}。`,
          `Aが当たったあとは、残り${n - 1}本のうち当たりは${a - 1}本。Bが当たる確率は ${rawFrac(a - 1, n - 1)}。`,
          `「Aが当たる」かつ「Bが当たる」はかけ算。${rawFrac(a, n)} × ${rawFrac(a - 1, n - 1)} = ${rawFrac(a * (a - 1), D)}`,
        ]
        break
      case 'missHit':
        target = [(n - a) * a, D]
        wrong = [[(n - a) * a, n * n], [a, n - 1], [a * (a - 1), D], [(n - a) * (n - a - 1), D], [n - a, n]]
        steps = [
          `Aがはずれる確率は ${rawFrac(n - a, n)}。`,
          `Aがはずれたあとは、残り${n - 1}本のうち当たりは${a}本のまま。Bが当たる確率は ${rawFrac(a, n - 1)}。`,
          `「Aがはずれる」かつ「Bが当たる」はかけ算。${rawFrac(n - a, n)} × ${rawFrac(a, n - 1)} = ${rawFrac((n - a) * a, D)}`,
        ]
        break
      case 'exactlyOne':
        target = [2 * a * (n - a), D]
        wrong = [[a * (n - a), D], [2 * a * (n - a), n * n], [a * (a - 1), D], [(n - a) * (n - a - 1), D], [D - a * (a - 1), D]]
        steps = [
          '「ちょうど1人だけ」は、「Aだけ当たる」場合と「Bだけ当たる」場合の2つ。',
          `Aだけ当たる: Aが当たる確率は ${rawFrac(a, n)}。そのあと残り${n - 1}本のうちはずれは${n - a}本なので、Bがはずれる確率は ${rawFrac(n - a, n - 1)}。かけ算する。${rawFrac(a, n)} × ${rawFrac(n - a, n - 1)} = ${rawFrac(a * (n - a), D)}`,
          `Bだけ当たる: Aがはずれる確率は ${rawFrac(n - a, n)}。そのあと残り${n - 1}本のうち当たりは${a}本なので、Bが当たる確率は ${rawFrac(a, n - 1)}。かけ算する。${rawFrac(n - a, n)} × ${rawFrac(a, n - 1)} = ${rawFrac(a * (n - a), D)}`,
          `2つの場合は同時に起こらないので足し算する（分母が同じなので分子を足す）。${rawFrac(a * (n - a), D)} + ${rawFrac(a * (n - a), D)} = ${rawFrac(2 * a * (n - a), D)}`,
        ]
        break
      case 'second':
        target = [a * (n - 1), D]
        wrong = [[a * (a - 1), D], [a * (n - a), D], [a, n - 1], [a - 1, n - 1], [a - 1, n]]
        steps = [
          'Bが当たるのは、「Aが当たってBも当たる」場合と「Aがはずれ、Bが当たる」場合の2つ。',
          `Aが当たり、Bも当たる: ${rawFrac(a, n)} × ${rawFrac(a - 1, n - 1)} = ${rawFrac(a * (a - 1), D)}`,
          `Aがはずれ、Bが当たる: ${rawFrac(n - a, n)} × ${rawFrac(a, n - 1)} = ${rawFrac((n - a) * a, D)}`,
          `2つの場合は同時に起こらないので足し算する。${rawFrac(a * (a - 1), D)} + ${rawFrac((n - a) * a, D)} = ${rawFrac(a * (n - 1), D)}`,
        ]
        break
      default:
        target = [a * (a - 1) * (a - 2), n * (n - 1) * (n - 2)]
        wrong = [[a ** 3, n ** 3], [a * (a - 1), D], [a * (a - 1) * (a - 2), n ** 3], [a, n], [a * (a - 1) * (a - 2), n * (n - 1) * (n - 1)]]
        steps = [
          `Aが当たる確率は ${rawFrac(a, n)}。`,
          `Aが当たったあとは、残り${n - 1}本のうち当たりは${a - 1}本。Bが当たる確率は ${rawFrac(a - 1, n - 1)}。`,
          `Bも当たったあとは、残り${n - 2}本のうち当たりは${a - 2}本。Cが当たる確率は ${rawFrac(a - 2, n - 2)}。`,
          `3つが続けて起こる（かつ）のでかけ算。${rawFrac(a, n)} × ${rawFrac(a - 1, n - 1)} × ${rawFrac(a - 2, n - 2)} = ${rawFrac(target[0], target[1])}`,
        ]
    }
    const { choices, answer } = probChoices(rng, target[0], target[1], wrong)
    const tail =
      mode === 'second'
        ? ['これは、Aが当たる確率と同じ値になる。くじは引く順番によらず、当たる確率は同じである。']
        : []
    return {
      stem,
      choices,
      answer,
      targetSec: 90,
      hint: '引いたくじは戻さないので、2本目以降は「残りの本数」と「残りの当たり」で確率を考え、順にかけ算します。',
      explanation: [
        ...steps,
        ...reduceSteps(target[0], target[1]),
        ...tail,
        `答え: ${frac(target[0], target[1])}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 8. 少なくとも1回（余事象） difficulty 2

export type AtLeastOnceP =
  | { kind: 'coin'; n: number; side: string; ctx: number }
  | { kind: 'dice'; t: number; ctx: number }
  | { kind: 'trial'; a: number; b: number; n: number; ctx: number }

const atLeastOnce = spec<AtLeastOnceP>(
  { id: 'nv-probability/at-least-once', topic: 'nv-probability', difficulty: 2, label: '少なくとも1回（余事象）' },
  (rng) => {
    const kind = rng.pick<AtLeastOnceP['kind']>(['coin', 'dice', 'trial'])
    if (kind === 'coin') return { kind, n: rng.int(3, 5), side: rng.pick(['表', '裏']), ctx: rng.int(0, 1) }
    if (kind === 'dice') return { kind, t: rng.int(3, 6), ctx: rng.int(0, 1) }
    return retry(
      rng,
      (r): AtLeastOnceP => {
        const n = r.pick([2, 2, 3])
        const b = n === 2 ? r.int(3, 8) : r.pick([3, 4])
        return { kind: 'trial', a: r.int(1, Math.min(2, b - 1)), b, n, ctx: r.int(0, 1) }
      },
      (q) => q.kind === 'trial' && gcd(q.a, q.b) === 1, // 約分できる確率（2/4 など）は使わない
    )
  },
  (p, rng) => {
    // none = 「1回も（1個も）起こらない」確率（約分前）、wrong = よくある間違い
    let stem: string
    let none: Fr
    let wrong: Fr[]
    let ideaSteps: string[]
    let hint = '「少なくとも1回」は、反対の「1回も起こらない」確率を求めて、1から引くと簡単です。'
    if (p.kind === 'coin') {
      const { n, side, ctx } = p
      const other = side === '表' ? '裏' : '表'
      const unit = ctx === 0 ? '回' : '枚'
      const total = 2 ** n
      stem =
        ctx === 0
          ? `コインを${n}回続けて投げる。少なくとも1回は${side}が出る確率を求めよ。`
          : `${n}枚のコインを同時に投げる。少なくとも1枚は${side}が出る確率を求めよ。`
      none = [1, total]
      wrong = [[n, total], [1, total], [total - 2, total], [1, 2], [total - 1, 2 * total]]
      ideaSteps = [
        `「少なくとも1${unit}は${side}」の反対は「1${unit}も${side}が出ない（すべて${other}）」。「少なくとも〜」は、全体の確率1から反対の確率を引くと求めやすい（余事象）。`,
        `1${unit}が${other}になる確率は ${rawFrac(1, 2)}。${n}${unit}ともすべて${other}になる確率は ${Array(n).fill(rawFrac(1, 2)).join(' × ')} = ${rawFrac(1, total)}`,
      ]
    } else if (p.kind === 'dice') {
      const { t, ctx } = p
      const intro = ctx === 0 ? '大小2個のサイコロを同時に投げる。' : '赤と青の2個のサイコロを同時に投げる。'
      const word = t === 6 ? '6の目' : `${t}以上の目`
      const bad = t === 6 ? '5以下' : `${t - 1}以下`
      stem = `${intro}少なくとも1個は${word}が出る確率を求めよ。`
      none = [(t - 1) ** 2, 36]
      wrong = [[(t - 1) ** 2, 36], [(7 - t) ** 2, 36], [7 - t, 6], [2 * (7 - t), 6], [7 - t, 36]]
      ideaSteps = [
        `「少なくとも1個は${word}」の反対は「2個とも${bad}の目」。全体の確率1から反対の確率を引くと求めやすい（余事象）。`,
        `1個のサイコロで${bad}の目が出る確率は ${rawFrac(t - 1, 6)}。2個とも${bad}になる確率は ${rawFrac(t - 1, 6)} × ${rawFrac(t - 1, 6)} = ${rawFrac((t - 1) ** 2, 36)}`,
      ]
    } else {
      const { a, b, n, ctx } = p
      const failOne: Fr = [b - a, b]
      const noneN = (b - a) ** n
      const noneD = b ** n
      stem =
        ctx === 0
          ? `1回で当たりが出る確率が${rawFrac(a, b)}のくじ引きがある。引いたくじは毎回元に戻す。${n}回引くとき、少なくとも1回は当たる確率を求めよ。`
          : `あるゲームを1回プレイして景品がもらえる確率は${rawFrac(a, b)}である。各回の結果は互いに影響しないものとして、${n}回プレイするとき、少なくとも1回は景品がもらえる確率を求めよ。`
      none = [noneN, noneD]
      wrong = [[n * a, b], [a ** n, b ** n], [noneN, noneD], [a, b], [a * (b - a) * n, b ** n]]
      ideaSteps = [
        `「少なくとも1回は当たる」の反対は「${n}回とも当たらない」。全体の確率1から反対の確率を引くと求めやすい（余事象）。`,
        `1回で当たらない確率は 1 − ${rawFrac(a, b)} = ${raw(failOne)}。${n}回とも当たらない確率は ${Array(n).fill(raw(failOne)).join(' × ')} = ${rawFrac(noneN, noneD)}`,
      ]
      hint = '「少なくとも1回は当たる」は、反対の「1回も当たらない」確率を求めて、1から引くと簡単です。'
    }
    const [rn, rd] = reduce(none[0], none[1])
    const target: Fr = [rd - rn, rd]
    const { choices, answer } = probChoices(rng, none[1] - none[0], none[1], wrong)
    return {
      stem,
      choices,
      answer,
      targetSec: 75,
      hint,
      explanation: [
        ...ideaSteps,
        ...reduceSteps(none[0], none[1]),
        `求める確率 = 1 − ${rawFrac(rn, rd)} = ${rawFrac(target[0], target[1])}`,
        `答え: ${frac(target[0], target[1])}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 9. 玉を1個ずつ2回取り出す（戻す・戻さない） difficulty 3

export type BallsSeqP = { replace: boolean; kind: 'same' | 'diff' | 'redWhite'; r: number; w: number }

function seqProb(replace: boolean, kind: BallsSeqP['kind'], r: number, w: number): Fr {
  const n = r + w
  const n2 = replace ? n : n - 1
  const r2 = replace ? r : r - 1
  const w2 = replace ? w : w - 1
  const den = n * n2
  if (kind === 'same') return [r * r2 + w * w2, den]
  if (kind === 'diff') return [2 * r * w, den]
  return [r * w, den]
}

const ballsSeq = spec<BallsSeqP>(
  { id: 'nv-probability/balls-seq', topic: 'nv-probability', difficulty: 3, label: '玉を1個ずつ取り出す（戻す・戻さない）' },
  (rng) => ({
    replace: rng.chance(0.5),
    kind: rng.pick<BallsSeqP['kind']>(['same', 'diff', 'redWhite']),
    r: rng.int(2, 5),
    w: rng.int(2, 5),
  }),
  ({ replace, kind, r, w }, rng) => {
    const n = r + w
    const n2 = replace ? n : n - 1
    const r2 = replace ? r : r - 1
    const w2 = replace ? w : w - 1
    const den = n * n2
    const target = seqProb(replace, kind, r, w)
    const kinds: BallsSeqP['kind'][] = ['same', 'diff', 'redWhite']
    const wrong: Fr[] = [
      seqProb(!replace, kind, r, w), // 戻す・戻さないを取り違えた
      ...kinds.filter((k) => k !== kind).map((k) => seqProb(replace, k, r, w)),
      ...kinds.filter((k) => k !== kind).map((k) => seqProb(!replace, k, r, w)),
      notF(target),
    ]
    const question = {
      same: '取り出した2個が同じ色である確率を求めよ。',
      diff: '取り出した2個が違う色である確率を求めよ。',
      redWhite: '1個目が赤玉、2個目が白玉である確率を求めよ。',
    }[kind]
    const { choices, answer } = probChoices(rng, target[0], target[1], wrong)
    const first = replace
      ? `取り出した玉を戻すので、2個目を取り出すときも袋の中身は同じ（赤玉${r}個、白玉${w}個の計${n}個）。`
      : `取り出した玉を戻さないので、2個目を取り出すときは袋の中身が1個減って${n - 1}個になる。`
    const cases =
      kind === 'same'
        ? [
            `赤玉→赤玉: ${rawFrac(r, n)} × ${rawFrac(r2, n2)} = ${rawFrac(r * r2, den)}`,
            `白玉→白玉: ${rawFrac(w, n)} × ${rawFrac(w2, n2)} = ${rawFrac(w * w2, den)}`,
            `「赤→赤」または「白→白」なので足し算する。${rawFrac(r * r2, den)} + ${rawFrac(w * w2, den)} = ${rawFrac(target[0], den)}`,
          ]
        : kind === 'diff'
          ? [
              `赤玉→白玉: ${rawFrac(r, n)} × ${rawFrac(w, n2)} = ${rawFrac(r * w, den)}`,
              `白玉→赤玉: ${rawFrac(w, n)} × ${rawFrac(r, n2)} = ${rawFrac(r * w, den)}`,
              `「赤→白」または「白→赤」なので足し算する。${rawFrac(r * w, den)} + ${rawFrac(r * w, den)} = ${rawFrac(target[0], den)}`,
            ]
          : [`赤玉→白玉: ${rawFrac(r, n)} × ${rawFrac(w, n2)} = ${rawFrac(r * w, den)}`]
    return {
      stem: `袋の中に赤玉が${r}個、白玉が${w}個入っている。この袋から玉を1個ずつ続けて2個取り出す。取り出した玉は${replace ? 'そのつど袋に戻す' : '袋に戻さない'}。${question}`,
      choices,
      answer,
      targetSec: 100,
      hint: `${replace ? '戻すので毎回同じ確率です。' : '戻さないので2個目の確率は変わります。'}色の順番ごとに場合分けして、かけ算と足し算を使います。`,
      explanation: [
        first,
        ...cases,
        ...reduceSteps(target[0], target[1]),
        `答え: ${frac(target[0], target[1])}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------

/** テストが総当たりの検証に使う。アプリ本体は default export だけを使う */
export const SPECS = {
  diceSum,
  diceProduct,
  coin,
  independentAnd,
  independentOr,
  balls,
  lots,
  atLeastOnce,
  ballsSeq,
}

const generators: Generator[] = Object.values(SPECS).map((s) => s.generator)
export default generators
