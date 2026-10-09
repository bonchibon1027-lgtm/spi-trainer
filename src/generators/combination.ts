import type { Generator } from '../types'
import { defineGenerator, retry, type GeneratedBody } from './common'
import { balancedNumericChoices } from './balanced-choices'
import type { Rng } from '../lib/rng'
import { comb, factorial, perm } from '../lib/math'

// 場合の数（順列・組合せ・道順など）
//
// 各「型」は、乱数で数字を決める部分（draw）と、問題文・選択肢・解説を作る部分（build）に分けてある。
// こうしておくと、独自テスト（combination.test.ts）が draw の結果（パラメータ）を取り出して、
// 総当たりの数え上げで答えを別に求め、正解の選択肢と照らし合わせられる。
// アプリ本体は generator だけを使う。

type Meta = Parameters<typeof defineGenerator>[0]

export type Spec<P> = {
  generator: Generator
  draw: (rng: Rng) => P
  build: (p: P, rng: Rng) => GeneratedBody
}

function spec<P>(meta: Meta, draw: (rng: Rng) => P, build: (p: P, rng: Rng) => GeneratedBody): Spec<P> {
  return { generator: defineGenerator(meta, (rng) => build(draw(rng), rng)), draw, build }
}

// ---- 表記の小道具 ----

const down = (n: number, r: number) => Array.from({ length: r }, (_, i) => n - i) // n, n-1, ... を r 個
const upTo = (r: number) => Array.from({ length: r }, (_, i) => r - i) // r, r-1, ..., 1
const times = (xs: number[]) => xs.join(' × ')

/** 例: "5P3 = 5 × 4 × 3 = 60" */
const permLine = (n: number, r: number) => `${n}P${r} = ${times(down(n, r))} = ${perm(n, r)}`

/** 例: "5C2 = (5 × 4) ÷ (2 × 1) = 20 ÷ 2 = 10" */
const combLine = (n: number, r: number) =>
  r <= 1
    ? `${n}C${r} = ${comb(n, r)}（${n}個から${r}個を選ぶ選び方は${comb(n, r)}通り）`
    : `${n}C${r} = (${times(down(n, r))}) ÷ (${times(upTo(r))}) = ${perm(n, r)} ÷ ${factorial(r)} = ${comb(n, r)}`

/** 例: "5! = 5 × 4 × 3 × 2 × 1 = 120" */
const factLine = (m: number) => (m <= 1 ? `${m}! = 1` : `${m}! = ${times(upTo(m))} = ${factorial(m)}`)

const isCount = (n: number) => Number.isInteger(n) && n > 0

function countChoices(rng: Rng, correct: number, wrong: number[], unit = '通り') {
  return balancedNumericChoices(rng, correct, wrong, { format: (n) => `${n}${unit}`, isValid: isCount })
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

// ---------------------------------------------------------------------------
// 1. 選んで並べる（順列） difficulty 1

export type ArrangeP = { n: number; r: number; ctx: number }

const arrange = spec<ArrangeP>(
  { id: 'nv-combination/arrange', topic: 'nv-combination', difficulty: 1, label: '選んで並べる（順列）' },
  (rng) => ({ n: rng.int(4, 8), r: rng.int(2, 3), ctx: rng.int(0, 3) }),
  ({ n, r, ctx }, rng) => {
    const total = perm(n, r)
    const roles = r === 2 ? '委員長と副委員長' : '委員長、副委員長、書記'
    const stems = [
      `${n}人の中から${r}人を選び、一列に並べる。並べ方は全部で何通りあるか。`,
      `${n}人の中から、${roles}を1人ずつ選ぶ。1人が2つの役を兼ねることはないとき、選び方は何通りあるか。`,
      `1から${n}までの数字が1つずつ書かれた${n}枚のカードがある。この中から${r}枚を選んで左から順に並べ、${r}桁の整数を作る。整数は全部で何通り作れるか。`,
      `${n}人が徒競走をする。同着はないものとして、1位から${r}位までの決まり方は何通りあるか。`,
    ]
    const { choices, answer } = countChoices(rng, total, [
      comb(n, r), // 順列と組合せの取り違え
      n ** r, // 同じものを何度も選べると考えた
      n * r,
      perm(n, r - 1), // かける個数が1つ少ない
      perm(n, r + 1), // かける個数が1つ多い
    ])
    const order =
      r === 2
        ? `1番目の選び方は${n}通り。2番目は、1番目に選んだものを除いた${n - 1}通り。`
        : `1番目の選び方は${n}通り。2番目は、1番目に選んだものを除いた${n - 1}通り。3番目は、さらにそれを除いた${n - 2}通り。`
    return {
      stem: stems[ctx],
      choices,
      answer,
      targetSec: 60,
      hint: '順番が関係あるときは、1番目、2番目、…と順に「選べる数」をかけていきます。',
      explanation: [
        '順番が違えば別の結果になるので、順番を区別して数える（順列）。',
        `${n}P${r} は「${n}個から${r}個を選んで並べる並べ方」を表す。${n}から1ずつ小さい数を${r}個かけて求める。`,
        order,
        permLine(n, r),
        `答え: ${total}通り`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 2. 選ぶだけ（組合せ） difficulty 1

export type ChooseP = { n: number; r: number; ctx: number }

const choose = spec<ChooseP>(
  { id: 'nv-combination/choose', topic: 'nv-combination', difficulty: 1, label: '選ぶだけ（組合せ）' },
  (rng) => {
    const n = rng.int(5, 9)
    return { n, r: rng.int(2, Math.min(4, n - 2)), ctx: rng.int(0, 2) }
  },
  ({ n, r, ctx }, rng) => {
    const total = comb(n, r)
    const stems = [
      `${n}人の中から${r}人の代表を選ぶ。選び方は全部で何通りあるか。`,
      `${n}種類の果物から${r}種類を選んで、詰め合わせを作る。同じ種類は2つ入れないとき、詰め合わせは何通りできるか。`,
      `${n}本の映画の中から、観る${r}本を選ぶ。観る順番は考えないとき、選び方は何通りあるか。`,
    ]
    const { choices, answer } = countChoices(rng, total, [
      perm(n, r), // 順列と組合せの取り違え
      comb(n, r - 1),
      comb(n, r + 1),
      n * r,
      comb(n + 1, r),
    ])
    return {
      stem: stems[ctx],
      choices,
      answer,
      targetSec: 60,
      hint: '選ぶだけで順番は関係ありません。「順番を区別して数えた数」を、同じ顔ぶれの重なり分で割ります。',
      explanation: [
        `選ぶだけで並べる順番は関係ないので、組合せ（${n}C${r}）を使う。`,
        `${n}C${r} は「${n}個から${r}個を選ぶ選び方」を表す。「${n}から1ずつ小さい数を${r}個かけた数」を、「${r}から1までをかけた数」で割って求める。`,
        `まず順番を区別して${r}個並べると ${times(down(n, r))} = ${perm(n, r)} 通り（これが ${n}P${r}）。この数え方では、同じ顔ぶれを ${factorial(r)} 通り（= ${times(upTo(r))}）ずつ重ねて数えている。だから ${factorial(r)} で割る。`,
        combLine(n, r),
        `答え: ${total}通り`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 3. 総当たり・握手（2つを選ぶ） difficulty 1

export type RoundRobinP = { n: number; ctx: number }

const ROUND_ROBIN = [
  { q: (n: number) => `${n}チームが総当たり戦（どのチームとも1回ずつ対戦する）を行う。試合は全部で何試合になるか。`, unit: '試合', who: 'チーム' },
  { q: (n: number) => `${n}人が全員、自分以外の全員と1回ずつ握手をする。握手は全部で何回になるか。`, unit: '回', who: '人' },
  { q: (n: number) => `${n}人が集まり、どの2人も1回ずつ名刺を交換する。名刺の交換は全部で何回行われるか。`, unit: '回', who: '人' },
  { q: (n: number) => `${n}人のメンバー全員の間に、どの2人についても1本ずつ連絡用の回線を引く。回線は全部で何本必要か。`, unit: '本', who: '人' },
]

const roundRobin = spec<RoundRobinP>(
  { id: 'nv-combination/round-robin', topic: 'nv-combination', difficulty: 1, label: '総当たり・握手（2つの組）' },
  (rng) => ({ n: rng.int(4, 12), ctx: rng.int(0, ROUND_ROBIN.length - 1) }),
  ({ n, ctx }, rng) => {
    const total = comb(n, 2)
    const { q, unit, who } = ROUND_ROBIN[ctx]
    const { choices, answer } = countChoices(
      rng,
      total,
      [
        n * (n - 1), // 2回ずつ数えた
        comb(n + 1, 2),
        comb(n - 1, 2),
        n * (n - 1) / 2 + 1,
        n * (n - 2) / 2,
      ],
      unit,
    )
    return {
      stem: q(n),
      choices,
      answer,
      targetSec: 60,
      hint: '1つあたりの相手の数を数えて全員分をかけ、同じ組を2回数えた分を割ります。',
      explanation: [
        '「AとB」と「BとA」は同じ1組なので、2つの組を数える問題と考える。',
        `1${who === 'チーム' ? 'チーム' : '人'}あたり、自分以外の${n - 1}${who}が相手になる。${n}${who}分で ${n} × ${n - 1} = ${n * (n - 1)}`,
        `この数え方は、同じ組を2回ずつ数えている（AからみたBと、BからみたA）。だから2で割る。${n * (n - 1)} ÷ 2 = ${total}`,
        `これは組合せ ${n}C2 = (${n} × ${n - 1}) ÷ (2 × 1) = ${n * (n - 1)} ÷ 2 = ${total} と同じ。`,
        `答え: ${total}${unit}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 4. グループから別々に選ぶ（aCx × bCy） difficulty 2

export type GroupsP = { a: number; b: number; x: number; y: number; ctx: number }

const GROUP_NAMES = [
  ['男子', '女子'],
  ['営業部の社員', '企画部の社員'],
  ['1年生', '2年生'],
]

const groups = spec<GroupsP>(
  { id: 'nv-combination/groups', topic: 'nv-combination', difficulty: 2, label: 'グループごとに選ぶ（かけ算）' },
  (rng) =>
    retry(
      rng,
      (r) => {
        const a = r.int(4, 6)
        const b = r.int(3, 5)
        return { a, b, x: r.int(2, Math.min(3, a - 1)), y: r.int(1, Math.min(2, b - 1)), ctx: r.int(0, 2) }
      },
      (p) => comb(p.a, p.x) * comb(p.b, p.y) <= 250,
    ),
  ({ a, b, x, y, ctx }, rng) => {
    const [g0, g1] = GROUP_NAMES[ctx]
    const A = comb(a, x)
    const B = comb(b, y)
    const total = A * B
    const { choices, answer } = countChoices(rng, total, [
      comb(a + b, x + y), // 全員をまとめて選んだ
      A + B, // かけ算でなく足し算にした
      perm(a, x) * perm(b, y), // 順列にした
      comb(a, y) * comb(b, x), // 人数を取り違えた
      A * B * (x + y),
    ])
    return {
      stem: `${g0}${a}人、${g1}${b}人がいる。この中から、${g0}${x}人と${g1}${y}人を選んで${x + y}人のチームを作る。チームの作り方は何通りあるか。`,
      choices,
      answer,
      hint: `${g0}と${g1}を別々に「選ぶだけ」で数えて、最後にかけ算します。`,
      explanation: [
        `${g0}と${g1}を別々に考え、最後にかけ算する（「かつ」はかけ算）。順番は関係ないので、どちらも組合せを使う。`,
        `${g0}の選び方: ${combLine(a, x)}`,
        `${g1}の選び方: ${combLine(b, y)}`,
        `${g0}の選び方それぞれに、${g1}の選び方が組み合わさるので、かけ算する。${A} × ${B} = ${total}`,
        `答え: ${total}通り`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 5. 特定の人を必ず含む・含まない difficulty 2

export type IncludeP = { mode: 'must' | 'not' | 'both'; n: number; r: number; ctx: number }

const PURPOSES = ['代表', '掃除当番', 'プロジェクトメンバー']

const include = spec<IncludeP>(
  { id: 'nv-combination/include', topic: 'nv-combination', difficulty: 2, label: '特定の人を必ず含む・含まない' },
  (rng) => {
    const n = rng.int(6, 9)
    return {
      mode: rng.pick<IncludeP['mode']>(['must', 'not', 'both']),
      n,
      r: rng.int(3, 4),
      ctx: rng.int(0, PURPOSES.length - 1),
    }
  },
  ({ mode, n, r, ctx }, rng) => {
    const cond = {
      must: '特定のAさんが必ず含まれる',
      not: '特定のAさんが含まれない',
      both: '特定のAさんとBさんがどちらも含まれる',
    }[mode]
    const total =
      mode === 'must' ? comb(n - 1, r - 1) : mode === 'not' ? comb(n - 1, r) : comb(n - 2, r - 2)
    const wrong =
      mode === 'must'
        ? [comb(n, r), comb(n - 1, r), comb(n, r - 1), comb(n - 2, r - 1)]
        : mode === 'not'
          ? [comb(n, r), comb(n - 1, r - 1), comb(n - 2, r), comb(n, r - 1)]
          : [comb(n - 1, r - 1), comb(n, r), comb(n - 2, r), comb(n - 2, r - 1)]
    const { choices, answer } = countChoices(rng, total, wrong)
    const explanation =
      mode === 'must'
        ? [
            'Aさんは必ず選ばれるので、Aさんの分の枠は最初から決まっている。',
            `残りは「A以外の${n - 1}人から${r - 1}人を選ぶ」問題になる。順番は関係ないので組合せを使う。`,
            combLine(n - 1, r - 1),
            `答え: ${total}通り`,
          ]
        : mode === 'not'
          ? [
              'Aさんは選ばれないので、Aさんを最初から除いて考える。',
              `「A以外の${n - 1}人から${r}人を選ぶ」問題になる。順番は関係ないので組合せを使う。`,
              combLine(n - 1, r),
              `答え: ${total}通り`,
            ]
          : [
              'AさんとBさんは必ず選ばれるので、2人の分の枠は最初から決まっている。',
              `残りは「AとB以外の${n - 2}人から${r - 2}人を選ぶ」問題になる。順番は関係ないので組合せを使う。`,
              combLine(n - 2, r - 2),
              `答え: ${total}通り`,
            ]
    return {
      stem: `${n}人の中から${r}人の${PURPOSES[ctx]}を選ぶ。${cond}ような選び方は何通りあるか。`,
      choices,
      answer,
      hint: '必ず入る人は先に決めて、残りの人数と残りの枠で選び方を数えます。含まない人は最初から除いて考えます。',
      explanation,
    }
  },
)

// ---------------------------------------------------------------------------
// 6. 少なくとも1人を含む（全体 − 含まない） difficulty 2

export type AtLeastP = { a: number; b: number; r: number; ctx: number }

const AT_LEAST_GROUPS = [
  ['男子', '女子'],
  ['経験者', '初心者'],
  ['営業部の社員', '企画部の社員'],
]

const atLeast = spec<AtLeastP>(
  { id: 'nv-combination/at-least', topic: 'nv-combination', difficulty: 2, label: '少なくとも1人を含む（余事象）' },
  (rng) => {
    const a = rng.int(4, 6)
    return { a, b: rng.int(2, 4), r: rng.int(2, Math.min(3, a)), ctx: rng.int(0, AT_LEAST_GROUPS.length - 1) }
  },
  ({ a, b, r, ctx }, rng) => {
    const [g0, g1] = AT_LEAST_GROUPS[ctx]
    const n = a + b
    const all = comb(n, r)
    const none = comb(a, r)
    const total = all - none
    const { choices, answer } = countChoices(rng, total, [
      b * comb(n - 1, r - 1), // 「先に1人選んで残りから選ぶ」で二重に数えた
      all, // 全体をそのまま答えた
      b * comb(a, r - 1), // ちょうど1人の場合しか数えなかった
      none, // 含まない場合を答えた
      all - comb(b, r),
    ])
    return {
      stem: `${g0}${a}人、${g1}${b}人の合計${n}人から${r}人を選ぶ。少なくとも1人は${g1}が含まれる選び方は何通りあるか。`,
      choices,
      answer,
      hint: `「少なくとも1人」は、全体から「1人もいない場合」を引くと数えやすくなります。`,
      explanation: [
        `「少なくとも1人は${g1}」を直接数えるのは大変。そこで「全体の選び方」から「${g1}が1人もいない（全員${g0}）選び方」を引く。`,
        `全体（${n}人から${r}人を選ぶ）: ${combLine(n, r)}`,
        `${g1}が1人もいない（${g0}${a}人から${r}人を選ぶ）: ${combLine(a, r)}`,
        `引き算する。${all} − ${none} = ${total}`,
        `答え: ${total}通り`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 7. 隣り合う並び方 difficulty 2

export type AdjacentP = { n: number; k: number; group: number[]; ctx: number }

const adjacent = spec<AdjacentP>(
  { id: 'nv-combination/adjacent', topic: 'nv-combination', difficulty: 2, label: '隣り合う並び方' },
  (rng) => {
    const n = rng.pick([5, 6])
    const k = rng.pick([2, 3])
    const group = rng
      .shuffle(Array.from({ length: n }, (_, i) => i))
      .slice(0, k)
      .sort((x, y) => x - y)
    return { n, k, group, ctx: rng.int(0, 3) }
  },
  ({ n, k, group, ctx }, rng) => {
    const list = LABELS.slice(0, n).join('、')
    const names = group.map((i) => LABELS[i])
    const intro = [
      `${list}の${n}人が一列に並ぶ。`,
      `${list}の${n}人が横一列のベンチに座る。`,
      `${list}の${n}人が、写真を撮るために横一列に並ぶ。`,
      `${list}の${n}冊の本を、本棚に横一列に並べる。`,
    ][ctx]
    const cond =
      k === 2
        ? `${names[0]}と${names[1]}が隣り合う並べ方は何通りあるか。`
        : `${names.join('、')}の3つが続けて並ぶ（この3つの間にほかのものが入らない）並べ方は何通りあるか。`
    const groups = n - k + 1 // まとめた後に並べるものの数
    const inner = factorial(k)
    const total = factorial(groups) * inner
    const wrong =
      k === 2
        ? [factorial(n - 1), factorial(n), 2 * factorial(n - 2), factorial(n) / 2]
        : [factorial(n - 2), factorial(n), 3 * factorial(n - 2), 2 * factorial(n - 2)]
    const { choices, answer } = countChoices(rng, total, wrong)
    const rest = n - k
    return {
      stem: intro + cond,
      choices,
      answer,
      targetSec: 90,
      hint: '隣り合うものを「ひとまとめ」にして1つと考え、そのあとでまとめの中の並び方をかけ算します。',
      explanation: [
        `隣り合う${k}つ（${names.join('、')}）をひとまとめにして、「1つの組」と考える。`,
        `すると、組と残りの${rest}つを合わせた${groups}つを並べる問題になる。並べ方は ${groups}! 通り。`,
        factLine(groups),
        k === 2
          ? `組の中で${names[0]}と${names[1]}が入れ替わる並び方（「${names[0]}${names[1]}」と「${names[1]}${names[0]}」）が 2! = 2 通りある。`
          : `組の中の3つの並び方が 3! = 3 × 2 × 1 = 6 通りある。`,
        `組の並べ方と、組の中の並べ方をかけ算する。${factorial(groups)} × ${inner} = ${total}`,
        `答え: ${total}通り`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 8. 隣り合わない並び方 difficulty 3

export type ApartP =
  | { kind: 'two'; n: number; pair: number[]; ctx: number }
  | { kind: 'gender'; m: number; f: number }

const apart = spec<ApartP>(
  { id: 'nv-combination/apart', topic: 'nv-combination', difficulty: 3, label: '隣り合わない並び方' },
  (rng) => {
    if (rng.chance(0.5)) {
      const n = rng.pick([5, 6])
      const pair = rng
        .shuffle(Array.from({ length: n }, (_, i) => i))
        .slice(0, 2)
        .sort((x, y) => x - y)
      return { kind: 'two', n, pair, ctx: rng.int(0, 2) }
    }
    const [m, f] = rng.pick([
      [3, 2],
      [4, 2],
      [3, 3],
    ])
    return { kind: 'gender', m, f }
  },
  (p, rng) => {
    if (p.kind === 'two') {
      const { n, pair, ctx } = p
      const list = LABELS.slice(0, n).join('、')
      const [x, y] = pair.map((i) => LABELS[i])
      const intro = [`${list}の${n}人が一列に並ぶ。`, `${list}の${n}人が横一列のベンチに座る。`, `${list}の${n}人が、写真を撮るために横一列に並ぶ。`][ctx]
      const all = factorial(n)
      const together = 2 * factorial(n - 1)
      const total = all - together
      const { choices, answer } = countChoices(rng, total, [
        together, // 隣り合う方を答えた
        all - factorial(n - 1), // まとめの中の入れ替えを忘れて引いた
        factorial(n - 1),
        all,
        factorial(n - 2),
      ])
      return {
        stem: `${intro}${x}と${y}が隣り合わない並べ方は何通りあるか。`,
        choices,
        answer,
        targetSec: 90,
        hint: '「隣り合わない」は、全員の並べ方から「隣り合う並べ方」を引くと求められます。',
        explanation: [
          '「隣り合わない」並べ方 = 「全員の並べ方」 − 「隣り合う並べ方」と考える。',
          `全員の並べ方: ${factLine(n)}`,
          `隣り合う並べ方: ${x}と${y}をひとまとめにして ${n - 1}つを並べる。${factLine(n - 1)}。まとめの中の並び方が2通りあるので ${factorial(n - 1)} × 2 = ${together}`,
          `引き算する。${all} − ${together} = ${total}`,
          `答え: ${total}通り`,
        ],
      }
    }
    const { m, f } = p
    const mf = factorial(m)
    const slots = m + 1
    const womenWays = perm(slots, f)
    const total = mf * womenWays
    const { choices, answer } = countChoices(rng, total, [
      mf * comb(slots, f), // 女子の並べ替えを忘れた
      factorial(m + f), // 条件を無視した
      mf * factorial(f),
      womenWays,
      factorial(m + f) - total,
    ])
    return {
      stem: `男子${m}人、女子${f}人の合計${m + f}人が、一列に並ぶ。女子どうしがどの2人も隣り合わない並べ方は何通りあるか。（人はそれぞれ区別する）`,
      choices,
      answer,
      targetSec: 100,
      hint: '先に男子を並べて、男子の間や両端のすき間に女子を入れると、隣り合わなくなります。',
      explanation: [
        `女子どうしが隣り合わないようにするため、先に男子${m}人を並べ、そのすき間に女子を入れる。`,
        `男子${m}人の並べ方: ${factLine(m)}`,
        `男子の両端と間を合わせて、女子が入れるすき間は ${m + 1}か所ある。1か所に1人ずつ入れれば、女子は隣り合わない。`,
        `${m + 1}か所から${f}か所を選んで、女子${f}人を（区別して）入れる並べ方: ${permLine(slots, f)}`,
        `男子の並べ方と女子の入れ方をかけ算する。${mf} × ${womenWays} = ${total}`,
        `答え: ${total}通り`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 9. 0を含むカードで整数を作る difficulty 3

export type DigitsP = { mode: 'all' | 'even'; cards: number[] } // cards は 0 を含み昇順

const digits = spec<DigitsP>(
  { id: 'nv-combination/digits', topic: 'nv-combination', difficulty: 3, label: '0を含むカードで整数を作る' },
  (rng) =>
    retry(
      rng,
      (r) => {
        const k = r.int(3, 5) // 0以外のカードの枚数
        const cards = [0, ...r.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, k).sort((x, y) => x - y)]
        return { mode: r.pick<DigitsP['mode']>(['all', 'even']), cards }
      },
      (p) => p.mode === 'all' || p.cards.some((c) => c > 0 && c % 2 === 0),
    ),
  ({ mode, cards }, rng) => {
    const k = cards.length - 1 // 0以外の枚数
    const nzEvens = cards.filter((c) => c > 0 && c % 2 === 0)
    const ne = nzEvens.length
    const allCount = k * k * (k - 1)
    const zeroEnd = k * (k - 1)
    const otherEnd = ne * (k - 1) * (k - 1)
    const total = mode === 'all' ? allCount : zeroEnd + otherEnd
    const wrong =
      mode === 'all'
        ? [perm(k + 1, 3), k * (k - 1) * (k - 2), comb(k + 1, 3), k ** 3, perm(k + 1, 3) - k]
        : [(ne + 1) * k * (k - 1), allCount / 2, zeroEnd, (ne + 1) * (k - 1) * (k - 1), allCount]
    const { choices, answer } = countChoices(rng, total, wrong)
    const cardText = cards.join('、')
    const explanation =
      mode === 'all'
        ? [
            '3桁の整数の百の位に0は使えない。そこで、百の位、十の位、一の位の順に、使えるカードの数を数えてかけ算する。',
            `百の位: 0以外の${k}枚から1枚選ぶ → ${k}通り`,
            `十の位: 残り${k}枚（0も使える）から1枚選ぶ → ${k}通り`,
            `一の位: 残り${k - 1}枚から1枚選ぶ → ${k - 1}通り`,
            `かけ算する。${k} × ${k} × ${k - 1} = ${total}`,
            `答え: ${total}通り`,
          ]
        : [
            `偶数になるのは、一の位が偶数のカード（${[0, ...nzEvens].join('、')}）のとき。百の位に0は使えないので、一の位が0の場合と、0以外の偶数の場合に分けて数える。`,
            `一の位が0の場合: 百の位は0以外の${k}枚から${k}通り、十の位は残り${k - 1}枚から${k - 1}通り。${k} × ${k - 1} = ${zeroEnd}通り`,
            `一の位が${nzEvens.join('か')}の場合: 一の位の選び方は${ne}通り。百の位は、0と一の位に使ったカードを除く${k - 1}通り。十の位は、残り${k - 1}枚から${k - 1}通り。${ne} × ${k - 1} × ${k - 1} = ${otherEnd}通り`,
            `2つの場合は同時に起こらないので足し算する。${zeroEnd} + ${otherEnd} = ${total}`,
            `答え: ${total}通り`,
          ]
    return {
      stem: `${cardText}の数字が1つずつ書かれた${cards.length}枚のカードがある。この中から3枚を選んで左から順に並べ、3桁の${mode === 'even' ? '偶数' : '整数'}を作る。作れる${mode === 'even' ? '偶数' : '整数'}は全部で何通りあるか。（カードは1回ずつしか使えない）`,
      choices,
      answer,
      targetSec: 100,
      hint:
        mode === 'all'
          ? '百の位に0は置けません。いちばん制限のきつい百の位から順に決めていきます。'
          : '一の位が0かどうかで場合分けします。0は百の位に使えない点に注意します。',
      explanation,
    }
  },
)

// ---------------------------------------------------------------------------
// 10. 最短の道順 difficulty 2 / 途中の地点を通る道順 difficulty 3

const PLACES = [
  ['A地点', 'B地点'],
  ['家', '駅'],
  ['学校', '図書館'],
  ['P地点', 'Q地点'],
  ['本社', '取引先'],
]

export type RouteP = { a: number; b: number; ctx: number }

const route = spec<RouteP>(
  { id: 'nv-combination/route', topic: 'nv-combination', difficulty: 2, label: '最短の道順' },
  (rng) => ({ a: rng.int(2, 4), b: rng.int(2, 4), ctx: rng.int(0, PLACES.length - 1) }),
  ({ a, b, ctx }, rng) => {
    const [from, to] = PLACES[ctx]
    const k = Math.min(a, b)
    const kName = k === a ? '東' : '北'
    const total = comb(a + b, k)
    const { choices, answer } = countChoices(rng, total, [
      a * b,
      a + b,
      comb(a + b + 1, k),
      2 ** (a + b),
      comb(a + b, k) + a,
    ])
    return {
      stem: `${from}から${to}まで、東へ${a}区画、北へ${b}区画進む格子状の道がある。東か北にだけ進み、遠回りはしないとき、${from}から${to}までの行き方は何通りあるか。`,
      choices,
      answer,
      targetSec: 75,
      hint: '「東へ○回、北へ○回」の並べ方を数えます。合計の回数のうち、東に動く回をどこにするかを選ぶ問題です。',
      explanation: [
        `遠回りしないので、東へ${a}回、北へ${b}回、合わせて${a + b}回の移動をする。行き方は「${a + b}回のうち、どの回に${kName}へ動くか」で決まる。`,
        `${a + b}回の中から${kName}へ動く${k}回を選ぶ組合せなので、${a + b}C${k} を計算する。（順番は決まっているので、選ぶだけでよい）`,
        combLine(a + b, k),
        `答え: ${total}通り`,
      ],
    }
  },
)

export type RouteViaP = { a: number; b: number; p: number; q: number; ctx: number }

const routeVia = spec<RouteViaP>(
  { id: 'nv-combination/route-via', topic: 'nv-combination', difficulty: 3, label: '途中の地点を通る道順' },
  (rng) => {
    const a = rng.int(3, 4)
    const b = rng.int(3, 4)
    return { a, b, p: rng.int(1, a - 1), q: rng.int(1, b - 1), ctx: rng.int(0, PLACES.length - 1) }
  },
  ({ a, b, p, q, ctx }, rng) => {
    const [from, to] = PLACES[ctx]
    const ways = (x: number, y: number) => comb(x + y, Math.min(x, y))
    const first = ways(p, q)
    const second = ways(a - p, b - q)
    const total = first * second
    const { choices, answer } = countChoices(rng, total, [
      ways(a, b), // 途中の地点の条件を無視した
      first + second, // かけ算でなく足し算にした
      first,
      second,
      ways(a, b) - total,
    ])
    return {
      stem: `${from}から${to}まで、東へ${a}区画、北へ${b}区画進む格子状の道がある。${from}から東へ${p}区画、北へ${q}区画進んだ地点Cを必ず通るとき、東か北にだけ進んで遠回りせずに${to}へ行く行き方は何通りあるか。`,
      choices,
      answer,
      targetSec: 100,
      hint: '地点Cで道順を2つに分け、「前半の行き方」と「後半の行き方」をかけ算します。',
      explanation: [
        `地点Cを通るので、「${from}→C」と「C→${to}」の2つに分けて数え、最後にかけ算する。`,
        `${from}→C（東${p}回、北${q}回）: ${p + q}回の動きのうち、${p <= q ? '東' : '北'}へ動く${Math.min(p, q)}回を選ぶ。${combLine(p + q, Math.min(p, q))}`,
        `C→${to}（東${a - p}回、北${b - q}回）: ${a - p + b - q}回の動きのうち、${a - p <= b - q ? '東' : '北'}へ動く${Math.min(a - p, b - q)}回を選ぶ。${combLine(a - p + b - q, Math.min(a - p, b - q))}`,
        `前半のそれぞれに後半の行き方が組み合わさるので、かけ算する。${first} × ${second} = ${total}`,
        `答え: ${total}通り`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------

/** テストが総当たりの検証に使う。アプリ本体は default export だけを使う */
export const SPECS = {
  arrange,
  choose,
  roundRobin,
  groups,
  include,
  atLeast,
  adjacent,
  apart,
  digits,
  route,
  routeVia,
}

const generators: Generator[] = Object.values(SPECS).map((s) => s.generator)
export default generators
