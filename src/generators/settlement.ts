import type { Generator } from '../types'
import { defineGenerator, retry } from './common'
import { R, mixedChoices, posInt, withTarget } from './numeric-util'
import { num, yen } from '../lib/math'
import type { Rng } from '../lib/rng'

// 代金の精算（立て替え・貸し借り・割合での分担・一部の人だけが使う費用）
//
// 考え方はどの型も同じ: 「払った額 − 負担額」を人ごとに出して、多く払った人（受け取る側）と、足りない人（払う側）に分ける。
// 「RがPに払う額」が1つに決まるのは、次のどちらかのとき（問題に使うのはこの場合だけ）:
//   ・受け取る側がPだけ → Rは自分の不足分をそのままPに払う
//   ・払う側がRだけ     → Rは、Pが多く払った分をそのままPに払う
// 独自テスト（settlement.test.ts）が、問題文から払った額と負担の割合を読み取り直し、
// 精算の相手を並べる順番をすべて変えて試しても答えが変わらないことを確かめる。

type Who = 'P' | 'Q' | 'R' | 'S'
type Nets = Record<Who, number>

const rec = (people: Who[], f: (p: Who) => number): Nets => {
  const o = { P: 0, Q: 0, R: 0, S: 0 } as Nets
  for (const p of people) o[p] = f(p)
  return o
}

/** from が to に払う額。1つに決まらない（または払う向きが逆の）ときは null */
function uniquePay(nets: Nets, people: Who[], from: Who, to: Who): number | null {
  if (!(nets[from] < 0) || !(nets[to] > 0)) return null
  const creditors = people.filter((p) => nets[p] > 0)
  const debtors = people.filter((p) => nets[p] < 0)
  if (creditors.length === 1) return -nets[from]
  if (debtors.length === 1) return nets[to]
  return null
}

/** 1つに決まる (from, to) の組をすべて返す */
function validPairs(nets: Nets, people: Who[]): [Who, Who][] {
  const out: [Who, Who][] = []
  for (const f of people) for (const t of people) if (f !== t && uniquePay(nets, people, f, t) !== null) out.push([f, t])
  return out
}

/** 人ごとの「払った額 − 負担額」の説明（改行でつなぐ） */
function netLines(people: Who[], paid: Nets, owed: Nets): string {
  return people
    .map((p) => {
      const net = paid[p] - owed[p]
      if (net > 0) return `${p}: ${num(paid[p])} − ${num(owed[p])} = ${num(net)}円 多く払っている（受け取る側）`
      if (net < 0) return `${p}: ${num(owed[p])} − ${num(paid[p])} = ${num(-net)}円 足りない（払う側）`
      return `${p}: 払った額と負担額が同じ ${num(paid[p])}円（受け取りも支払いもない）`
    })
    .join('\n')
}

/** 受け取る側・払う側から、from が to に払う額が決まる理由 */
function conclusion(nets: Nets, people: Who[], from: Who, to: Who): string {
  const creditors = people.filter((p) => nets[p] > 0)
  if (creditors.length === 1) return `受け取る側は${to}だけなので、${from}は自分の不足分${num(-nets[from])}円を${to}に払えばよい。`
  return `払う側は${from}だけなので、${from}は${to}が多く払った分${num(nets[to])}円を${to}に払えばよい。`
}

// ---------------------------------------------------------------------------
// 3人の立て替え（共通の部品）
// ---------------------------------------------------------------------------

const THREE: Who[] = ['P', 'Q', 'R']

const THREE_CTX = [
  { event: '日帰り旅行に行った', items: ['交通費', '昼食代', '入場料'] },
  { event: 'バーベキューをした', items: ['食材代', '飲み物代', '炭や道具の代金'] },
  { event: '友人の誕生日会を開いた', items: ['会場費', '料理代', '飾りつけの代金'] },
  { event: 'キャンプに行った', items: ['食料品代', 'ガソリン代', 'テントのレンタル代'] },
] as const

/** 3人が払った額（500円単位、1人あたりの負担額も500円単位になるように合計は1500円の倍数） */
function drawThree(r: Rng): number[] {
  const zero = r.chance(0.25) ? r.int(0, 2) : -1
  return [0, 1, 2].map((i) => (i === zero ? 0 : r.step(1000, 12000, 500)))
}

const okThree = (x: number[]) => {
  const t = x[0] + x[1] + x[2]
  return t % 1500 === 0 && t >= 4500 && t <= 27000 && !(x[0] === x[1] && x[1] === x[2])
}

function threeHead(ctx: (typeof THREE_CTX)[number], x: number[]): string {
  const paid = THREE.map((p, i) => ({ p, i })).filter(({ i }) => x[i] > 0)
  const zeros = THREE.filter((_, i) => x[i] === 0)
  const body = paid.map(({ p, i }) => `${p}が${ctx.items[i]}${yen(x[i])}`).join('、')
  const zero = zeros.map((p) => `${p}は何も支払っていない`).join('。')
  return `P、Q、Rの3人で${ctx.event}。${body}を立て替えて支払った${zero ? `（${zero}）` : ''}。`
}

function threeNets(x: number[]) {
  const total = x[0] + x[1] + x[2]
  const m = total / 3
  const paid = rec(THREE, (p) => x[THREE.indexOf(p)])
  const owed = rec(THREE, () => m)
  const nets = rec(THREE, (p) => paid[p] - m)
  return { total, m, paid, owed, nets }
}

const sumText = (x: number[]) => `${x.filter((v) => v > 0).map(num).join(' + ')} = ${num(x[0] + x[1] + x[2])}円`

// ---------------------------------------------------------------------------
// 1. 3人で費用を分担して精算する（難易度1）
// ---------------------------------------------------------------------------

const three = defineGenerator(
  { id: 'nv-settlement/three', topic: 'nv-settlement', difficulty: 1, label: '3人で立て替えた費用の精算' },
  (rng) => {
    const ctx = rng.pick(THREE_CTX)
    const x = retry(rng, drawThree, okThree)
    const { total, m, paid, owed, nets } = threeNets(x)
    const head = threeHead(ctx, x)
    const lead = `${head}かかった費用の合計を3人で等しく分担することにして、精算する。`
    const calc = [
      `3人が払った額の合計 = ${sumText(x)}`,
      `1人あたりの負担額 = ${num(total)} ÷ 3 = ${num(m)}円`,
      netLines(THREE, paid, owed),
    ]

    if (rng.chance(0.65)) {
      // RがPに払う額
      const pairs = validPairs(nets, THREE)
      const [from, to] = rng.pick(pairs)
      const ans = uniquePay(nets, THREE, from, to) as number
      const xf = paid[from]
      const xt = paid[to]
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [
          -nets[from], // 払う人の不足分（Pだけに払うとは限らない場合の取り違え）
          nets[to], // 受け取る人の多く払った分
          m, // 1人あたりの負担額を答えた
          (xt - xf) / 2, // 3人目を無視して、2人だけで割り勘にした
          xt - xf,
          xt / 3,
        ].map(R),
        { format: yen, padStep: 500, isValid: posInt },
      )
      return {
        stem: `${lead}${from}が${to}に払う金額はいくらか。`,
        choices,
        answer,
        hint: '1人あたりの負担額を出し、人ごとに「払った額 − 負担額」を調べます。足りない人が、多く払った人に払います。',
        explanation: [...calc, conclusion(nets, THREE, from, to), `答え: ${yen(ans)}`],
      }
    }

    // 1人の受け取り（支払い）の合計
    const who = rng.pick(THREE.filter((p) => nets[p] !== 0))
    const gets = nets[who] > 0
    const ans = Math.abs(nets[who])
    const others = THREE.filter((p) => p !== who)
    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        m, // 1人あたりの負担額を答えた
        Math.abs(nets[others[0]]), // 別の人の額を答えた
        Math.abs(nets[others[1]]),
        paid[who] / 3,
        paid[who] / 2,
        total - paid[who],
      ].map(R),
      { format: yen, padStep: 500, isValid: posInt },
    )
    return {
      stem: `${lead}${who}は、精算によって他の2人との間で、全部でいくら${gets ? '受け取る' : '支払う'}ことになるか。`,
      choices,
      answer,
      hint: '1人あたりの負担額を出して、その人が払った額との差を求めます。',
      explanation: [
        ...calc,
        gets
          ? `${who}は他の2人から、多く払った分 ${num(ans)}円 を受け取る。`
          : `${who}は他の2人に、足りない分 ${num(ans)}円 を払う。`,
        `答え: ${yen(ans)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 2. 以前の貸し借りを含めて精算する（難易度2）
// ---------------------------------------------------------------------------

const borrow = defineGenerator(
  { id: 'nv-settlement/borrow', topic: 'nv-settlement', difficulty: 2, label: '以前の貸し借りを含めた精算' },
  (rng) => {
    const ctx = rng.pick(THREE_CTX)
    const { x, from, to, L, fromOwes } = retry(
      rng,
      (r) => {
        const x = drawThree(r)
        const pair = r.shuffle(THREE)
        return { x, from: pair[0], to: pair[1], L: r.step(500, 4000, 500), fromOwes: r.chance(0.5) }
      },
      ({ x, from, to, L, fromOwes }) => {
        if (!okThree(x)) return false
        const { nets } = threeNets(x)
        if (!(nets[from] < 0 && nets[to] > 0)) return false
        const adj = { ...nets }
        adj[from] += fromOwes ? -L : L
        adj[to] += fromOwes ? L : -L
        return adj[from] < 0 && adj[to] > 0 && uniquePay(adj, THREE, from, to) !== null
      },
    )
    const { total, m, paid, owed, nets } = threeNets(x)
    const base = uniquePay(nets, THREE, from, to) as number
    const ans = fromOwes ? base + L : base - L
    const opposite = fromOwes ? base - L : base + L
    const loanText = fromOwes
      ? `以前に${from}が${to}から${yen(L)}を借りたままになっていたので、今回の精算でその分も返すことにした。`
      : `以前に${to}が${from}から${yen(L)}を借りたままになっていたので、今回の精算でその分も返すことにした。`

    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        base, // 貸し借りを忘れた
        opposite, // 貸し借りの向きを逆にした
        L, // 貸し借りの額だけを答えた
        m,
        (base + L) / 2,
        -nets[from] + L,
      ].map(R),
      { format: yen, padStep: 500, isValid: posInt },
    )
    return {
      stem: `${threeHead(ctx, x)}かかった費用の合計を3人で等しく分担することにして、精算する。このほか、${loanText}貸し借りの分も含めて、${from}が${to}に払う金額はいくらか。`,
      choices,
      answer,
      hint: 'まず貸し借りを考えずに精算の額を出します。そのあと、貸し借りの向きに注意して足すか引くかを決めます。',
      explanation: [
        `3人が払った額の合計 = ${sumText(x)}`,
        `1人あたりの負担額 = ${num(total)} ÷ 3 = ${num(m)}円`,
        netLines(THREE, paid, owed),
        `貸し借りを考えない場合は、${conclusion(nets, THREE, from, to)}`,
        fromOwes
          ? `${from}は${to}に${num(L)}円を返す必要があるので、払う額は増える。${num(base)} + ${num(L)} = ${num(ans)}円`
          : `${to}は${from}に${num(L)}円を返す必要があり、その分は${from}が払う額から引ける。${num(base)} − ${num(L)} = ${num(ans)}円`,
        `答え: ${yen(ans)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 3. 4人で割合を決めて分担する（難易度2）
// ---------------------------------------------------------------------------

const FOUR: Who[] = ['P', 'Q', 'R', 'S']
const WEIGHTS: number[][] = [
  [3, 2, 2, 1],
  [2, 2, 1, 1],
  [4, 3, 2, 1],
  [3, 3, 2, 2],
  [2, 1, 1, 1],
  [5, 2, 2, 1],
  [4, 2, 2, 2],
]

const ratio = defineGenerator(
  { id: 'nv-settlement/ratio', topic: 'nv-settlement', difficulty: 2, label: '4人で割合を決めて分担する精算' },
  (rng) => {
    const w = rng.pick(WEIGHTS)
    const sum = w.reduce((a, b) => a + b, 0)
    const twoPayers = rng.chance(0.5)
    const { u, a, from, to } = retry(
      rng,
      (r) => {
        const u = r.step(500, 3000, 500)
        const T = u * sum
        const a = twoPayers ? r.step(500, T - 500, 500) : T
        const pair = r.shuffle(FOUR)
        return { u, a, from: pair[0], to: pair[1] }
      },
      ({ u, a, from, to }) => {
        const T = u * sum
        const paid = rec(FOUR, (p) => (p === 'P' ? a : p === 'Q' ? T - a : 0))
        const owed = rec(FOUR, (p) => u * w[FOUR.indexOf(p)])
        const nets = rec(FOUR, (p) => paid[p] - owed[p])
        return uniquePay(nets, FOUR, from, to) !== null && (twoPayers ? true : to === 'P') && T <= 30000 && T >= 6000
      },
    )
    const T = u * sum
    const b = T - a
    const paid = rec(FOUR, (p) => (p === 'P' ? a : p === 'Q' ? b : 0))
    const share = rec(FOUR, (p) => u * w[FOUR.indexOf(p)])
    const nets = rec(FOUR, (p) => paid[p] - share[p])
    const ans = uniquePay(nets, FOUR, from, to) as number

    const rule =
      sum === 10
        ? `この費用は、${FOUR.map((p, i) => `${p}が${w[i] * 10}%`).join('、')}の割合で負担することにして、精算する。`
        : `この費用は、P、Q、R、Sの負担の比を ${w.join(':')} として、精算する。`
    const payText = twoPayers ? `Pが${yen(a)}、Qが${yen(b)}を立て替えて支払った` : `Pが全額を立て替えて支払った`
    const stem = `P、Q、R、Sの4人でグループ旅行をした。費用の合計は${yen(T)}で、${payText}。${rule}${from}が${to}に払う金額はいくらか。`

    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        T / 4, // 等しく分けた
        share[from], // 払う人の負担額を答えた
        -nets[from], // 払う人の不足分
        nets[to], // 受け取る人の多く払った分
        share[to], // 受け取る人の負担額を答えた
        T - share[to], // 相手の負担額を全体から引いた
        ...FOUR.filter((p) => p !== from && p !== to).map((p) => share[p]),
      ].map(R),
      { format: yen, padStep: 500, isValid: posInt },
    )
    const ratioStep = `比の合計 = ${w.join(' + ')} = ${sum}`
    const unitStep = `比の「1」にあたる金額 = ${num(T)} ÷ ${sum} = ${num(u)}円`
    const shareStep = `各自の負担額（${num(u)}円 × 比の数）\n${FOUR.map((p, i) => `${p}: ${num(u)} × ${w[i]} = ${num(share[p])}円`).join('\n')}`
    return {
      stem,
      choices,
      answer,
      hint: '比の合計で全体の費用を割り、比の「1」にあたる金額を求めます。各自の負担額と払った額の差で精算します。',
      explanation: [
        ratioStep,
        unitStep,
        shareStep,
        netLines(FOUR, paid, share),
        conclusion(nets, FOUR, from, to),
        `答え: ${yen(ans)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 4. 費用ごとに分担する人が違う精算（難易度3）
// ---------------------------------------------------------------------------

const PARTIAL_ITEMS = ['宿泊費', '夕食代', 'レンタカー代', '入場料', 'ガソリン代', '遊覧船の料金', '朝食代', '飲み物代']

type PItem = { name: string; amount: number; payer: Who; sharers: Who[] }

function partialNets(items: PItem[]) {
  const paid = rec(FOUR, () => 0)
  const owed = rec(FOUR, () => 0)
  for (const it of items) {
    paid[it.payer] += it.amount
    for (const s of it.sharers) owed[s] += it.amount / it.sharers.length
  }
  const nets = rec(FOUR, (p) => paid[p] - owed[p])
  return { paid, owed, nets }
}

const partial = defineGenerator(
  { id: 'nv-settlement/partial', topic: 'nv-settlement', difficulty: 3, label: '費用ごとに分担する人が違う精算' },
  (rng) => {
    const { items, from, to } = retry(
      rng,
      (r) => {
        const names = r.shuffle(PARTIAL_ITEMS).slice(0, 3)
        const out = r.pick(FOUR) // 2つ目の費用に参加しない人
        const pair = r.shuffle(FOUR).slice(0, 2) as Who[] // 3つ目の費用を分ける2人
        const sets: Who[][] = [FOUR, FOUR.filter((p) => p !== out), pair.slice().sort()]
        const its: PItem[] = sets.map((sh, i) => ({
          name: names[i],
          amount: sh.length * r.step(500, 3000, 500),
          payer: r.pick(sh),
          sharers: sh,
        }))
        const ft = r.shuffle(FOUR)
        return { items: its, from: ft[0], to: ft[1] }
      },
      ({ items, from, to }) => {
        const { nets } = partialNets(items)
        return uniquePay(nets, FOUR, from, to) !== null && items.reduce((s, it) => s + it.amount, 0) <= 30000
      },
    )
    const { paid, owed, nets } = partialNets(items)
    const ans = uniquePay(nets, FOUR, from, to) as number
    const total = items.reduce((s, it) => s + it.amount, 0)

    // よくある間違い: 2人の間の貸し借りだけを見た／全員で等分した
    const grossFT = items
      .filter((it) => it.payer === to && it.sharers.includes(from))
      .reduce((s, it) => s + it.amount / it.sharers.length, 0)
    const grossTF = items
      .filter((it) => it.payer === from && it.sharers.includes(to))
      .reduce((s, it) => s + it.amount / it.sharers.length, 0)
    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        grossFT, // 相手が立て替えた費用のうち、自分の分だけを答えた
        grossFT - grossTF, // 2人の間の貸し借りだけで相殺した
        nets[to] > 0 && -nets[from] !== ans ? -nets[from] : nets[to],
        Math.abs(total / 4 - paid[from]), // 全員で等しく分けた
        owed[from], // 自分の負担額を答えた
        paid[to],
      ].map(R),
      { format: yen, padStep: 500, isValid: posInt },
    )

    const setText = (it: PItem) => {
      if (it.sharers.length === 4) return '4人全員で等しく分担することにし'
      if (it.sharers.length === 3) return `${FOUR.find((p) => !it.sharers.includes(p))}を除く3人で等しく分担することにし`
      return `${it.sharers.join('と')}の2人で等しく分担することにし`
    }
    const stem =
      `P、Q、R、Sの4人でグループ旅行をした。` +
      items.map((it) => `${it.name}${yen(it.amount)}は${setText(it)}、${it.payer}が立て替えた。`).join('') +
      `すべての費用を、この分担のとおりに精算する。${from}が${to}に払う金額はいくらか。`

    const perShare = items.map((it) => `${it.name} = ${num(it.amount)} ÷ ${it.sharers.length} = ${num(it.amount / it.sharers.length)}円`).join('、')
    const owedLines = FOUR.map((p) => {
      const parts = items.filter((it) => it.sharers.includes(p)).map((it) => num(it.amount / it.sharers.length))
      return parts.length === 1
        ? `${p}の負担額: ${num(owed[p])}円（${items.find((it) => it.sharers.includes(p))!.name}だけ）`
        : `${p}の負担額: ${parts.join(' + ')} = ${num(owed[p])}円`
    }).join('\n')
    const paidLines = FOUR.map((p) => {
      const parts = items.filter((it) => it.payer === p).map((it) => num(it.amount))
      if (parts.length === 0) return `${p}が立て替えた額: 0円`
      if (parts.length === 1) return `${p}が立て替えた額: ${parts[0]}円`
      return `${p}が立て替えた額: ${parts.join(' + ')} = ${num(paid[p])}円`
    }).join('\n')
    return {
      stem,
      choices,
      answer,
      hint: '費用ごとに1人あたりの金額を出し、人ごとに負担額と立て替えた額を集計します。その差で精算します。',
      explanation: [
        `費用ごとの1人あたりの金額: ${perShare}`,
        `人ごとの負担額（参加する費用の1人分を足す）\n${owedLines}`,
        `人ごとの立て替えた額\n${paidLines}`,
        `払った額と負担額の差\n${netLines(FOUR, paid, owed)}`,
        conclusion(nets, FOUR, from, to),
        `答え: ${yen(ans)}`,
      ],
    }
  },
)

const generators: Generator[] = [withTarget(three, 70), withTarget(borrow, 90), withTarget(ratio, 100), withTarget(partial, 150)]
export default generators
