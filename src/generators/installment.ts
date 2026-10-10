import type { Generator } from '../types'
import { defineGenerator, retry } from './common'
import { R, decStr, mixedChoices, mixedSorted, posInt, withTarget } from './numeric-util'
import { frac, lcm, num, rawFrac, reduce, yen } from '../lib/math'
import type { Rng } from '../lib/rng'

// 分割払い（頭金と均等払い・続けて払う・分割手数料・払い終わる回数・一括払いとの比較）
//
// 分数の答えは「総額の何分のいくつ」。解説の分数は {{n/d}} と書く。
// 独自テスト（installment.test.ts）が、問題文から払い方を1回ずつシミュレーションして答えを確かめる。

// ---------------------------------------------------------------------------
// 分数の小道具（約分した分数を扱う）
// ---------------------------------------------------------------------------

type Fr = { n: number; d: number }
const fr = (n: number, d = 1): Fr => {
  const [rn, rd] = reduce(n, d)
  return { n: rn, d: rd }
}
const fAdd = (a: Fr, b: Fr) => fr(a.n * b.d + b.n * a.d, a.d * b.d)
const fSub = (a: Fr, b: Fr) => fr(a.n * b.d - b.n * a.d, a.d * b.d)
const fMul = (a: Fr, b: Fr) => fr(a.n * b.n, a.d * b.d)
const fVal = (a: Fr) => a.n / a.d
/** 表記 "{{3/8}}"（整数なら "1"、0 なら "0"） */
const fs = (a: Fr) => frac(a.n, a.d)
/** 約分前の表記（解説の途中式用） */
const fsRaw = (n: number, d: number) => rawFrac(n, d)
/** 分数の選択肢 */
const fItem = (a: Fr) => ({ label: fs(a), value: fVal(a) })
/** 分数の掛け算 a × b を「約分前 = 約分後」の形で書く（約分前と約分後が同じなら片方だけ） */
function mulText(a: Fr, b: Fr): string {
  const rawN = a.n * b.n
  const rawD = a.d * b.d
  const r = fMul(a, b)
  const raw = fsRaw(rawN, rawD)
  return raw === fs(r) ? `${fs(a)} × ${fs(b)} = ${fs(r)}` : `${fs(a)} × ${fs(b)} = ${raw} = ${fs(r)}`
}

/** 正解の近くの分数（選択肢の埋め草）。0 より大きく 1 以下のものだけ */
function fracPads(ans: Fr): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = []
  const push = (n: number, d: number) => {
    if (n <= 0 || d <= 0 || n >= d) return // 1 以上の値（総額の全部など）は選択肢にしない
    out.push(fItem(fr(n, d)))
  }
  const { n, d } = ans
  push(n + 1, d)
  push(n - 1, d)
  push(n, d + 1)
  push(n, d - 1)
  push(n + 1, d + 1)
  push(n * 2, d * 2 + 1)
  push(n * 2 + 1, d * 2)
  push(n * 2 - 1, d * 2)
  push(n * 3 + 1, d * 3)
  push(n * 3 - 1, d * 3)
  push(n, d * 2 - 1)
  push(n + 2, d)
  return out
}

/** 分数の選択肢を作る（間違いの候補は優先度順。足りない分は埋め草で補う） */
function fracChoices(rng: Rng, ans: Fr, wrongs: Fr[]) {
  const cands = [...wrongs.filter((w) => w.n > 0 && w.n < w.d).map(fItem), ...fracPads(ans)]
  return mixedSorted(rng, fItem(ans), cands)
}

const money = (n: number) => num(n)

// ---------------------------------------------------------------------------
// 1. 頭金と残りの均等払い（難易度1）
//    「総額の a を支払い、残りを n 回の均等払い」→ 1回の支払いは総額のどれだけか（または何円か）
// ---------------------------------------------------------------------------

const DOWNS: [number, number][] = [
  [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [1, 6], [3, 8], [5, 8], [1, 10], [3, 10],
]
const COUNTS = [2, 3, 4, 5, 6, 8, 10, 12]

const equal = defineGenerator(
  { id: 'nv-installment/equal', topic: 'nv-installment', difficulty: 1, label: '頭金と残りの均等払い' },
  (rng) => {
    const { down, n } = retry(
      rng,
      (r) => ({ down: fr(...r.pick(DOWNS)), n: r.pick(COUNTS) }),
      // 答えの分母が大きすぎる組み合わせは使わない
      ({ down, n }) => fSub(fr(1), down).d * n <= 48,
    )
    const rem = fSub(fr(1), down)
    const per = fr(rem.n, rem.d * n)
    const askYen = rng.chance(0.4)

    if (!askYen) {
      const { choices, answer } = fracChoices(rng, per, [
        fr(1, n), // 頭金を引き忘れた
        fr(down.n, down.d * n), // 頭金を回数で割ってしまった
        rem, // 回数で割り忘れた
        fr(rem.n, rem.d * (n + 1)), // 頭金も1回に数えた
        n > 2 ? fr(rem.n, rem.d * (n - 1)) : fr(1, 2 * n),
        fMul(down, rem), // 頭金と残りをかけた
      ])
      const raw = fsRaw(rem.n, rem.d * n)
      return {
        stem: `ある商品を分割払いで買うことにした。購入時に総額の${fs(down)}を支払い、残りを${n}回の均等払いにする。1回の支払いは、総額のどれだけか。`,
        choices,
        answer,
        hint: '総額を1とみて、頭金を引いた残りを求めます。その残りを回数で割ります。',
        explanation: [
          `総額を1とすると、残りは 1 − ${fs(down)} = ${fs(rem)}`,
          `残りを${n}回に分けるので、1回分 = ${fs(rem)} ÷ ${n} = ${raw === fs(per) ? fs(per) : `${raw} = ${fs(per)}`}`,
          `答え: ${fs(per)}`,
        ],
      }
    }

    const { T } = retry(
      rng,
      (r) => ({ T: r.step(20000, 400000, 5000) }),
      ({ T }) =>
        (T * down.n) % down.d === 0 &&
        (T * rem.n) % (rem.d * n) === 0 &&
        ((T * rem.n) / (rem.d * n)) % 100 === 0, // 1回の支払額が100円単位になる総額だけ使う
    )
    const downYen = (T * down.n) / down.d
    const remYen = T - downYen
    const perYen = remYen / n
    const { choices, answer } = mixedChoices(
      rng,
      perYen,
      [
        T / n, // 頭金を引き忘れた
        (downYen / n), // 頭金を回数で割った
        remYen, // 回数で割り忘れた
        remYen / (n + 1), // 頭金も1回に数えた
        n > 2 ? remYen / (n - 1) : T / 2,
        downYen,
      ].map(R),
      { format: yen, padStep: Math.max(100, Math.round(perYen / 1000) * 100), isValid: posInt },
    )
    return {
      stem: `総額${yen(T)}の商品を分割払いで買うことにした。購入時に総額の${fs(down)}を支払い、残りを${n}回の均等払いにする。1回の支払額はいくらか。`,
      choices,
      answer,
      hint: '頭金は総額に分数をかけて求めます。総額から頭金を引いた残りを、回数で割ります。',
      explanation: [
        `購入時に払う額（頭金）= ${money(T)} × ${fs(down)} = ${money(downYen)}円`,
        `残りの額 = ${money(T)} − ${money(downYen)} = ${money(remYen)}円`,
        `1回の支払額 = ${money(remYen)} ÷ ${n} = ${yen(perYen)}`,
        `答え: ${yen(perYen)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 2. 残額の何分のいくつ、と続く払い方（難易度2）
// ---------------------------------------------------------------------------

const FIRSTS: [number, number][] = [[1, 2], [1, 3], [1, 4], [1, 5], [2, 5], [1, 6], [2, 3], [3, 4], [3, 5], [3, 10]]
const LATERS: [number, number][] = [[1, 2], [1, 3], [1, 4], [2, 3], [3, 4], [2, 5], [3, 5], [1, 5]]
const ORD = ['', '1回目', '2回目', '3回目', '4回目']

type Seq = { fs: Fr[]; pays: Fr[]; rems: Fr[] }

/** 払い方（fs[0] は総額に対する割合、fs[1] 以降は残額に対する割合）から、各回の支払いと残りを求める */
function runSeq(parts: Fr[], k: number): Seq {
  const pays: Fr[] = []
  const rems: Fr[] = []
  let rem = fr(1)
  for (let i = 0; i < k - 1; i++) {
    const pay = i === 0 ? parts[0] : fMul(rem, parts[i])
    pays.push(pay)
    rem = fSub(rem, pay)
    rems.push(rem)
  }
  pays.push(rem) // 最後は残りすべて
  rems.push(fr(0))
  return { fs: parts, pays, rems }
}

const sequence = defineGenerator(
  { id: 'nv-installment/sequence', topic: 'nv-installment', difficulty: 2, label: '残額の何分のいくつ、と続けて払う' },
  (rng) => {
    const k = rng.chance(0.7) ? 3 : 4 // 支払いの回数
    const { parts, j } = retry(
      rng,
      (r) => {
        const parts = [fr(...r.pick(FIRSTS))]
        for (let i = 1; i < k - 1; i++) parts.push(fr(...r.pick(LATERS)))
        const j = r.chance(0.4) ? k : r.int(2, k - 1)
        return { parts, j }
      },
      ({ parts }) => {
        const s = runSeq(parts, k)
        return [...s.pays, ...s.rems].every((f) => f.d <= 60)
      },
    )
    const s = runSeq(parts, k)
    const ans = s.pays[j - 1]

    // 総額が円で示されるとき（全部の支払いが整数円になる総額を探す）
    const askYen = rng.chance(0.45)
    let total = 0
    if (askYen) {
      const need = [...s.pays, ...s.rems].reduce((a, f) => lcm(a, f.d), 1)
      // 総額は1万円単位を優先し、無理なら1000円単位にする
      const L = [10000, 1000].map((u) => lcm(need, u)).find((x) => x <= 400000)
      if (L) {
        const maxM = Math.floor(600000 / L)
        total = L * rng.int(Math.max(1, Math.ceil(20000 / L)), Math.max(1, maxM))
      }
    }
    const inYen = total > 0

    const partsText = s.fs
      .slice(0, k - 1)
      .map((f, i) => (i === 0 ? `1回目に総額の${fs(f)}を支払い` : `${ORD[i + 1]}にその時点の残額の${fs(f)}を支払い`))
      .join('、')
    const head = inYen ? `総額${yen(total)}の商品を${k}回に分けて支払った。` : `ある商品を${k}回に分けて支払った。`
    const stem = inYen
      ? `${head}${partsText}、${ORD[k]}に残りすべてを支払った。${ORD[j]}の支払額はいくらか。`
      : `${head}${partsText}、${ORD[k]}に残りすべてを支払った。${ORD[j]}の支払いは、総額のどれだけか。`

    // 間違い: 残額に対する割合を総額の割合と考えた、残りを答えた、割合をそのまま引いた、など
    const sumFirst = parts.slice(0, k - 1).reduce((a, f) => fAdd(a, f), fr(0))
    const wrongs: Fr[] = []
    if (j < k) {
      wrongs.push(parts[j - 1]) // 残額に対する割合を、総額に対する割合と考えた
      wrongs.push(s.rems[j - 1]) // 払ったあとの残りを答えた
      wrongs.push(j === 1 ? fr(1) : s.rems[j - 2]) // 払う前の残りを答えた
    } else {
      wrongs.push(fSub(fr(1), sumFirst)) // 割合をすべて総額に対するものと考えた
      wrongs.push(s.pays[j - 2]) // 1つ前の支払いを答えた
      wrongs.push(s.rems[j - 3] ?? s.rems[0])
    }
    if (j - 1 < parts.length) wrongs.push(fSub(fr(1), parts[j - 1]))
    const valid = wrongs.filter((w) => w.n > 0 && w.n <= w.d && fVal(w) < 1)

    // 解説（各回の支払いを順にたどる）
    const exp: string[] = []
    if (inYen) exp.push(`総額を1とみて、各回の支払いを総額に対する割合で求める。`)
    for (let i = 0; i < Math.min(j, k); i++) {
      if (i === 0) {
        exp.push(`1回目は総額の${fs(s.pays[0])}。残りは 1 − ${fs(s.pays[0])} = ${fs(s.rems[0])}`)
      } else if (i < k - 1) {
        const prev = s.rems[i - 1]
        exp.push(
          `${ORD[i + 1]}は残り（${fs(prev)}）の${fs(parts[i])}なので、${mulText(prev, parts[i])}。残りは ${fs(prev)} − ${fs(s.pays[i])} = ${fs(s.rems[i])}`,
        )
      } else {
        exp.push(`${ORD[k]}は残りすべてなので、${fs(s.rems[k - 2])}`)
      }
    }

    if (!inYen) {
      const { choices, answer } = fracChoices(rng, ans, valid)
      exp.push(`答え: ${fs(ans)}`)
      return {
        stem,
        choices,
        answer,
        hint: '総額を1として、1回ずつ「払った額」と「残り」を求めていきます。残額に対する割合は、残りにかけます。',
        explanation: exp,
      }
    }

    const ansYen = (total * ans.n) / ans.d
    const wrongYen = valid.map((w) => (total * w.n) / w.d)
    const { choices, answer } = mixedChoices(rng, ansYen, wrongYen.map(R), {
      format: yen,
      padStep: Math.max(1000, Math.round(ansYen / 10000) * 1000),
      isValid: posInt,
    })
    exp.push(`${ORD[j]}の支払額 = ${money(total)} × ${fs(ans)} = ${yen(ansYen)}`, `答え: ${yen(ansYen)}`)
    return {
      stem,
      choices,
      answer,
      hint: '総額を1として、1回ずつ「払った額」と「残り」を求めていきます。最後に総額をかけて金額にします。',
      explanation: exp,
    }
  },
)

// ---------------------------------------------------------------------------
// 3. 分割手数料（難易度2）
// ---------------------------------------------------------------------------

const feeGen = defineGenerator(
  { id: 'nv-installment/fee', topic: 'nv-installment', difficulty: 2, label: '分割手数料つきの分割払い' },
  (rng) => {
    const { X, Rm, f, n } = retry(
      rng,
      (r) => ({
        X: r.step(10000, 100000, 10000),
        Rm: r.step(40000, 300000, 10000),
        f: r.pick([2, 3, 4, 5, 8, 10, 15, 20]),
        n: r.pick([3, 4, 5, 6, 8, 10, 12]),
      }),
      ({ Rm, f, n }) => {
        const fee = (Rm * f) / 100
        const pay = Rm + fee
        return Number.isInteger(fee) && pay % n === 0 && (pay / n) % 10 === 0
      },
    )
    const T = X + Rm
    const fee = (Rm * f) / 100
    const payTotal = Rm + fee
    const each = payTotal / n
    const total = X + payTotal
    const ask = rng.pick(['each', 'each', 'total', 'fee'] as const)

    const lead = `代金${yen(T)}の商品を分割払いで買う。購入時に頭金${yen(X)}を支払い、残りには分割手数料として残額の${f}%が加算され、その合計を${n}回の均等払いで支払う。`
    const dec = decStr(f / 100)
    const step1 = `頭金を除いた残額 = ${money(T)} − ${money(X)} = ${money(Rm)}円`
    const step2 = `分割手数料 = ${money(Rm)} × ${dec} = ${money(fee)}円（残額の${f}%）`

    if (ask === 'each') {
      const { choices, answer } = mixedChoices(
        rng,
        each,
        [
          Rm / n, // 手数料を忘れた
          ((T * (100 + f)) / 100 - X) / n, // 手数料を代金全体にかけた
          (T + fee) / n, // 頭金を引き忘れた
          fee / n, // 手数料だけを回数で割った
          payTotal, // 回数で割り忘れた
          (Rm + f) / n, // 手数料のパーセントを金額として足した
        ].map(R),
        { format: yen, padStep: 100, isValid: posInt },
      )
      return {
        stem: `${lead}1回の支払額はいくらか。`,
        choices,
        answer,
        hint: '頭金を引いた残額に手数料を足してから、回数で割ります。手数料の割合は残額にかけます。',
        explanation: [
          step1,
          step2,
          `分割払いの合計 = ${money(Rm)} + ${money(fee)} = ${money(payTotal)}円`,
          `1回の支払額 = ${money(payTotal)} ÷ ${n} = ${yen(each)}`,
          `答え: ${yen(each)}`,
        ],
      }
    }

    if (ask === 'total') {
      const { choices, answer } = mixedChoices(
        rng,
        total,
        [
          payTotal, // 頭金を足し忘れた
          (T * (100 + f)) / 100, // 手数料を代金全体にかけた
          T, // 手数料を忘れた
          X + Rm + f, // 手数料のパーセントを金額として足した
          T + fee / n,
        ].map(R),
        { format: yen, padStep: 1000, isValid: posInt },
      )
      return {
        stem: `${lead}支払総額（頭金を含む）はいくらか。`,
        choices,
        answer,
        hint: '手数料がかかるのは頭金を除いた残額だけです。最後に頭金を足すのを忘れないようにしましょう。',
        explanation: [
          step1,
          step2,
          `分割払いの合計 = ${money(Rm)} + ${money(fee)} = ${money(payTotal)}円`,
          `支払総額 = ${money(X)} + ${money(payTotal)} = ${yen(total)}`,
          `答え: ${yen(total)}`,
        ],
      }
    }

    const { choices, answer } = mixedChoices(
      rng,
      fee,
      [
        (T * f) / 100, // 手数料を代金全体にかけた
        fee / n, // 1回あたりの手数料を答えた
        (X * f) / 100, // 頭金にかけた
        payTotal, // 残額と手数料の合計を答えた
        fee + fee / n,
      ].map(R),
      { format: yen, padStep: Math.max(100, Math.round(fee / 10 / 100) * 100), isValid: posInt },
    )
    return {
      stem: `${lead}分割手数料は全部でいくらか。`,
      choices,
      answer,
      hint: '手数料がかかるのは頭金を除いた残額だけです。1回あたりではなく全部の額を答えます。',
      explanation: [step1, step2, `答え: ${yen(fee)}`],
    }
  },
)

// ---------------------------------------------------------------------------
// 4. 毎月決まった額ずつ払う（払い終わる回数・最後の月の額）（難易度2）
// ---------------------------------------------------------------------------

const months = defineGenerator(
  { id: 'nv-installment/months', topic: 'nv-installment', difficulty: 2, label: '毎月一定額ずつ払うときの回数・最後の支払い' },
  (rng) => {
    const { X, m, full, last } = retry(
      rng,
      (r) => {
        const m = r.pick([5000, 6000, 8000, 10000, 12000, 15000])
        return {
          X: r.step(10000, 100000, 10000),
          m,
          full: r.int(4, 14),
          last: r.int(1, Math.floor(m / 1000) - 1) * 1000,
        }
      },
      ({ m, full, last, X }) => last > 0 && last < m && X <= m * full + last && m * full + last + X <= 400000,
    )
    const Rm = m * full + last
    const T = X + Rm
    const count = full + 1
    const askLast = rng.chance(0.45)

    const lead = `総額${yen(T)}の商品を分割払いで買う。購入時に頭金${yen(X)}を支払い、残りを毎月${yen(m)}ずつ支払う。ただし、最後の月は${yen(m)}に満たない残りの額をそのまま支払う。`
    const common = [
      `頭金を除いた残額 = ${money(T)} − ${money(X)} = ${money(Rm)}円`,
      `毎月${money(m)}円ずつ${full}回払うと、${money(m)} × ${full} = ${money(m * full)}円`,
      `まだ残っている額 = ${money(Rm)} − ${money(m * full)} = ${money(last)}円（${money(m)}円に満たない）`,
    ]
    if (!askLast) {
      const { choices, answer } = mixedChoices(
        rng,
        count,
        [
          full, // 端数の最後の月を数え忘れた
          full + 2,
          Math.ceil(T / m), // 頭金を引き忘れた
          Math.floor(T / m),
          Math.round(Rm / m),
        ].map(R),
        { format: (x) => `${x}回目`, padStep: 1, isValid: (x) => posInt(x) && x > 0 && x <= count + 3 },
      )
      return {
        stem: `${lead}分割払いを全部払い終えるのは、分割の何回目の支払いか。`,
        choices,
        answer,
        hint: '頭金を引いた残りを、毎月の額で割ります。割り切れない分は、さらに1回の支払いが必要です。',
        explanation: [
          ...common,
          `この${money(last)}円を、次の${full + 1}回目に払って終わる。`,
          `答え: ${count}回目`,
        ],
      }
    }
    const { choices, answer } = mixedChoices(
      rng,
      last,
      [
        m, // 毎月の額を答えた
        m - last,
        T - m * full, // 頭金を引き忘れた
        Rm - m * (full - 1),
        last + 1000,
        last + 2000,
      ].map(R),
      // 最後の月の支払いは毎月の額以下。それを超える値は選択肢にしない
      { format: yen, padStep: 1000, isValid: (x) => posInt(x) && x <= m },
    )
    return {
      stem: `${lead}最後の月の支払額はいくらか。`,
      choices,
      answer,
      hint: '頭金を引いた残りから、毎月の額を払えるだけ払った残りを求めます。',
      explanation: [...common, `最後の月の支払額は、残っている${money(last)}円。`, `答え: ${yen(last)}`],
    }
  },
)

// ---------------------------------------------------------------------------
// 5. 一括払いと分割払いの比較（難易度2）
// ---------------------------------------------------------------------------

const compare = defineGenerator(
  { id: 'nv-installment/compare', topic: 'nv-installment', difficulty: 2, label: '一括払いと分割払いの総額の差' },
  (rng) => {
    const { T, d, X, n, m } = retry(
      rng,
      (r) => ({
        T: r.step(30000, 300000, 10000),
        d: r.pick([5, 10, 15, 20, 25]),
        X: r.step(10000, 100000, 10000),
        n: r.pick([3, 4, 5, 6, 8, 10, 12]),
        m: r.step(2000, 40000, 1000),
      }),
      ({ T, d, X, n, m }) => {
        const I = X + n * m
        return (T * (100 - d)) % 100 === 0 && I >= T * 1.02 && I <= T * 1.2 && X <= T * 0.5
      },
    )
    const cash = (T * (100 - d)) / 100
    const I = X + n * m
    const diff = I - cash
    const dec = decStr((100 - d) / 100)
    const { choices, answer } = mixedChoices(
      rng,
      diff,
      [
        T - cash, // 現金で買うときの割引額を答えた
        I - T, // 定価との差を答えた
        n * m - cash, // 頭金を足し忘れた
        I - (T * d) / 100, // 割引後の代金を、定価の割引額と取り違えた
        I, // 分割払いの総額を答えた
        cash,
      ].map(R),
      { format: yen, padStep: 1000, isValid: posInt },
    )
    return {
      stem: `定価${yen(T)}の商品がある。現金で一括して払うと定価の${d}%引きになる。分割払いでは、購入時に頭金${yen(X)}を支払い、残りを毎月${yen(m)}の${n}回払いで支払う。分割払いで支払う総額は、現金一括払いの代金より何円高いか。`,
      choices,
      answer,
      hint: '一括払いの代金と、分割払いの総額（頭金を含む）を、それぞれ出してから差をとります。',
      explanation: [
        `一括払いの代金は定価の${100 - d}%（${dec}倍）なので、${money(T)} × ${dec} = ${money(cash)}円`,
        `分割払いの毎月の支払い = ${money(m)} × ${n} = ${money(m * n)}円`,
        `分割払いの総額 = ${money(X)} + ${money(m * n)} = ${money(I)}円（頭金を含める）`,
        `差 = ${money(I)} − ${money(cash)} = ${yen(diff)}`,
        `答え: ${yen(diff)}`,
      ],
    }
  },
)

const generators: Generator[] = [
  withTarget(equal, 60),
  withTarget(sequence, 90),
  withTarget(feeGen, 90),
  withTarget(months, 80),
  withTarget(compare, 90),
]
export default generators
