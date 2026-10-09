import type { Generator } from '../types'
import { defineGenerator, retry } from './common'
import { COSTS, R, decStr, mixedChoices, okPct, pctStr, posInt, toPercentSteps, withTarget } from './numeric-util'
import { frac, gcd, num, rawFrac, reduce, round, yen } from '../lib/math'

// 損益算（原価・定価・売価・利益）
//
// 書き方の見本（ほかの分野の型もこの形にそろえる）:
// 1. 答えから逆算して、答えがきれいな整数になる数字だけを選ぶ（retry で引き直す）
// 2. よくある間違い方の値を、優先度の高い順に mixedChoices に渡す
// 3. 解説は途中の式を省略しない。最後のステップに「答え: <正解の選択肢と同じ文字列>」を書く

const markup = defineGenerator(
  { id: 'nv-profit/markup', topic: 'nv-profit', difficulty: 1, label: '利益を見込んだ定価と値引き' },
  (rng) => {
    const { cost, up, down } = retry(
      rng,
      (r) => ({ cost: r.step(1000, 9000, 100), up: r.int(2, 5), down: r.int(1, 3) }),
      // 値引き後も利益が出る組み合わせだけ使う
      ({ up, down }) => (10 + up) * (10 - down) > 100,
    )
    const list = (cost * (10 + up)) / 10 // 定価
    const sale = (list * (10 - down)) / 10 // 売価
    const profit = sale - cost

    // 正解の位置が偏らないよう mixedChoices を使う（numericChoices だと 1〜2 番目に寄る）
    const { choices, answer } = mixedChoices(
      rng,
      profit,
      [
        list - cost, // 値引きを忘れた
        (cost * (up - down)) / 10, // 割合をそのまま引き算した（3割 − 2割 = 1割）
        sale - list + cost, // 引く向きを間違えた
        (list * down) / 10, // 値引き額を答えた
      ],
      { format: yen, padStep: 10, isValid: (n) => n > 0 && Number.isInteger(n) },
    )

    return {
      stem: `ある商品に、原価の${up}割の利益を見込んで定価をつけた。しかし売れなかったので、定価の${down}割引きで売った。このときの利益はいくらか。原価は${yen(cost)}とする。`,
      choices,
      answer,
      hint: 'まず定価、次に値引き後の売価を出し、最後に原価を引きます。',
      explanation: [
        `${up}割 = 0.${up}、${down}割 = 0.${down} と小数に直す。`,
        `定価 = 原価 × (1 + 0.${up}) = ${num(cost)} × ${(10 + up) / 10} = ${yen(list)}`,
        `売価 = 定価 × (1 − 0.${down}) = ${num(list)} × ${(10 - down) / 10} = ${yen(sale)}`,
        `利益 = 売価 − 原価 = ${num(sale)} − ${num(cost)} = ${yen(profit)}`,
        `答え: ${yen(profit)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 以下は見本にそろえて追加した型
// ---------------------------------------------------------------------------

/** 20 → "2割"、25 → "25%" のように、割で言い切れるときは割で書く */
const rateText = (u: number) => (u % 10 === 0 && u < 100 ? `${u / 10}割` : `${decStr(u)}%`)

// 売価（または利益額）と利益率から原価を逆算する
const costFromSale = defineGenerator(
  { id: 'nv-profit/cost-from-sale', topic: 'nv-profit', difficulty: 1, label: '売価（利益額）と利益率から原価を求める' },
  (rng) => {
    const u = rng.pick([10, 20, 25, 30, 40, 50])
    const cost = rng.pick(COSTS)
    const sale = (cost * (100 + u)) / 100
    const profit = (cost * u) / 100

    if (rng.chance(0.65)) {
      const [rn, rd] = reduce(100 + u, 100)
      const { choices, answer } = mixedChoices(
        rng,
        cost,
        [
          (sale * (100 - u)) / 100, // 売価から利益率を引いてしまった
          (sale * u) / 100, // 売価の u% を答えた
          sale - u * 10,
          (sale * 100) / (100 + u) + 100,
        ].map(R),
        { format: yen, padStep: 100, isValid: posInt },
      )
      return {
        stem: `ある商品に原価の${rateText(u)}の利益を見込んで売価をつけたところ、売価は${yen(sale)}になった。この商品の原価はいくらか。`,
        choices,
        answer,
        hint: '原価を100%としたとき、売価は何%にあたるかを考えます。「原価 × (1 + 利益率) = 売価」を逆にたどります。',
        explanation: [
          `原価を100%とすると、売価は ${100 + u}%（原価 + 利益）。つまり 原価 × ${decStr((100 + u) / 100)} = ${num(sale)}`,
          `${100 + u}% = ${rawFrac(rn, rd)} なので、原価 = ${num(sale)} ÷ ${rn} × ${rd}（わる数の分母と分子を入れかえてかける）`,
          `${num(sale)} ÷ ${rn} = ${num(sale / rn)}、${num(sale / rn)} × ${rd} = ${num(cost)}`,
          `答え: ${yen(cost)}`,
        ],
      }
    }

    const [un, ud] = reduce(u, 100)
    const { choices, answer } = mixedChoices(
      rng,
      cost,
      [
        (profit * u) / 100, // 利益に利益率をかけてしまった
        sale, // 売価を答えた
        (profit * (100 + u)) / 100,
        profit * 10,
      ].map(R),
      { format: yen, padStep: 100, isValid: posInt },
    )
    return {
      stem: `ある商品に原価の${rateText(u)}の利益を見込んで売ったところ、利益は${yen(profit)}だった。この商品の原価はいくらか。`,
      choices,
      answer,
      hint: '利益は「原価 × 利益率」です。利益率を分数に直し、逆にたどって原価を求めます。',
      explanation: [
        `利益 = 原価 × 利益率。つまり 原価 × ${decStr(u / 100)} = ${num(profit)}`,
        `${u}% = ${rawFrac(un, ud)} なので、原価 = ${num(profit)} ÷ ${un} × ${ud}（わる数の分母と分子を入れかえてかける）`,
        un === 1
          ? `${num(profit)} × ${ud} = ${num(cost)}`
          : `${num(profit)} ÷ ${un} = ${num(profit / un)}、${num(profit / un)} × ${ud} = ${num(cost)}`,
        `答え: ${yen(cost)}`,
      ],
    }
  },
)

// 原価に対する利益率
const profitRate = defineGenerator(
  { id: 'nv-profit/profit-rate', topic: 'nv-profit', difficulty: 1, label: '原価と売価から利益率を求める' },
  (rng) => {
    const u = rng.pick([5, 10, 15, 20, 25, 30, 40, 50])
    const cost = rng.pick(COSTS)
    const sale = (cost * (100 + u)) / 100
    const profit = sale - cost
    const { choices, answer } = mixedChoices(
      rng,
      u,
      [
        round((profit / sale) * 100, 1), // 売価で割ってしまった
        (sale / cost) * 100, // 売価が原価の何%かを答えた
        u / 10,
        u * 2,
      ].map(R),
      { format: pctStr, padStep: u >= 20 ? 5 : 1, isValid: okPct },
    )
    return {
      stem: `原価${yen(cost)}の商品を${yen(sale)}で売った。原価に対する利益の割合（利益率）は何%か。`,
      choices,
      answer,
      hint: '利益 = 売価 − 原価。利益率は、利益を「原価」で割って求めます（売価ではありません）。',
      explanation: [
        '利益 = 売価 − 原価、利益率 = 利益 ÷ 原価（もとにする量は原価）。',
        `利益 = ${num(sale)} − ${num(cost)} = ${yen(profit)}`,
        ...toPercentSteps(profit, cost, u),
        `答え: ${pctStr(u)}`,
      ],
    }
  },
)

// 原価と同じ値段になるまで値引きする
// 「利益見込みの割合 u」と「定価からの値引き率 d」の組（d = u ÷ (100 + u) が割りきれるもの）
const BREAK_PAIRS: { u: number; d: number }[] = [
  { u: 25, d: 20 },
  { u: 60, d: 37.5 },
  { u: 100, d: 50 },
  { u: 150, d: 60 },
  { u: 300, d: 75 },
]

const breakEven = defineGenerator(
  { id: 'nv-profit/break-even', topic: 'nv-profit', difficulty: 2, label: '原価と同じ値段になる値引き率' },
  (rng) => {
    const { u, d } = rng.pick(BREAK_PAIRS)
    const cost = rng.pick(COSTS)
    const list = (cost * (100 + u)) / 100
    const disc = list - cost

    if (rng.chance(0.6)) {
      const { choices, answer } = mixedChoices(
        rng,
        d,
        [u, (cost / list) * 100, 100 - u, u / 2, d + 5].map(R),
        { format: pctStr, padStep: 5, isValid: okPct },
      )
      const [rn, rd] = reduce(disc, list)
      return {
        stem: `原価${yen(cost)}の商品に、原価の${rateText(u)}の利益を見込んで定価をつけた。売れ残ったので、定価から値引きして、原価と同じ値段で売ることにした。定価の何%引きにすればよいか。`,
        choices,
        answer,
        hint: '値引きの割合は、値引き額を「定価」で割って求めます（原価で割りません）。',
        explanation: [
          `定価 = 原価 × (1 + ${decStr(u / 100)}) = ${num(cost)} × ${decStr((100 + u) / 100)} = ${yen(list)}`,
          `原価と同じ値段で売るので、値引き額 = 定価 − 原価 = ${num(list)} − ${num(cost)} = ${yen(disc)}`,
          `値引き率 = 値引き額 ÷ 定価 = ${num(disc)} ÷ ${num(list)} = ${rawFrac(disc, list)} = ${frac(rn, rd)}`,
          `${frac(rn, rd)} = ${decStr(disc / list)} = ${pctStr(d)}`,
          `答え: ${pctStr(d)}`,
        ],
      }
    }

    // 逆向き: 定価の d% 引きが原価と同じ → 定価は原価の何%増しか
    const { choices, answer } = mixedChoices(
      rng,
      u,
      [d, 100 - d, u + 10, u - 10, u * 2].map(R),
      { format: pctStr, padStep: 10, isValid: okPct },
    )
    const sc = Number.isInteger(d) ? 1 : 10
    const top = d * sc
    const bottom = (100 - d) * sc
    return {
      stem: `原価${yen(cost)}の商品に定価をつけたが、売れなかったので定価の${decStr(d)}%引きで売ったところ、売価は原価と同じになった。この定価は、原価の何%増しか。`,
      choices,
      answer,
      hint: '定価を100とおくと、売価は「100 − 値引き率」になります。それが原価と同じです。',
      explanation: [
        `定価を100とすると、${decStr(d)}%引きの売価は 100 × ${decStr((100 - d) / 100)} = ${decStr(100 - d)}`,
        `この売価が原価と同じなので、原価 = ${decStr(100 - d)}。定価と原価の差 = 100 − ${decStr(100 - d)} = ${decStr(d)}`,
        `原価に対する割合 = ${decStr(d)} ÷ ${decStr(100 - d)} = ${rawFrac(top, bottom)}${gcd(top, bottom) > 1 ? ` = ${frac(top, bottom)}` : ''} = ${decStr(d / (100 - d))}`,
        `${decStr(d / (100 - d))} × 100 = ${pctStr(u)}`,
        `答え: ${pctStr(u)}`,
      ],
    }
  },
)

// まとめて仕入れて、一部を定価・残りを値引きで売る
const bulk = defineGenerator(
  { id: 'nv-profit/bulk', topic: 'nv-profit', difficulty: 3, label: '仕入れた商品を定価と値引きで売ったときの総利益' },
  (rng) => {
    const { c, u, d, N, k } = retry(
      rng,
      (r) => ({
        c: r.step(100, 1000, 100),
        u: r.pick([20, 25, 30, 40, 50]),
        d: r.pick([10, 20, 25, 30]),
        N: r.pick([20, 30, 40, 50]),
        k: r.int(5, 8),
      }),
      ({ c, u, d }) => {
        const list = (c * (100 + u)) / 100
        const s2 = (list * (100 - d)) / 100
        return Number.isInteger(list) && Number.isInteger(s2) && s2 > c
      },
    )
    const m = (N * k) / 10 // 定価で売れた個数
    const rest = N - m
    const list = (c * (100 + u)) / 100
    const s2 = (list * (100 - d)) / 100
    const a = list - c // 定価で売れた1個の利益
    const b = s2 - c // 値引きして売れた1個の利益
    const ans = a * m + b * rest

    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        a * N, // 全部定価で売れたと考えた
        a * m, // 値引きして売った分を忘れた
        b * N, // 全部値引きで売れたと考えた
        list * m + s2 * rest, // 売上を答えた（原価を引き忘れた）
        a * m + s2 * rest, // 値引き分だけ原価を引き忘れた
      ].map(R),
      { format: yen, padStep: 100, isValid: posInt },
    )
    return {
      stem: `ある店が、原価${yen(c)}の商品を${N}個仕入れ、原価の${rateText(u)}の利益を見込んで定価をつけた。そのうち${m}個は定価で売れ、残りの${rest}個は定価の${rateText(d)}引きで売った。すべて売れたとき、利益は全部でいくらか。`,
      choices,
      answer,
      hint: '定価と値引き後の売価をそれぞれ出し、1個あたりの利益に個数をかけて合計します。',
      explanation: [
        `定価 = 原価 × (1 + ${decStr(u / 100)}) = ${num(c)} × ${decStr((100 + u) / 100)} = ${yen(list)}`,
        `値引き後の売価 = 定価 × (1 − ${decStr(d / 100)}) = ${num(list)} × ${decStr((100 - d) / 100)} = ${yen(s2)}`,
        `1個あたりの利益: 定価で売れた分 = ${num(list)} − ${num(c)} = ${num(a)}円、値引きして売れた分 = ${num(s2)} − ${num(c)} = ${num(b)}円`,
        `定価で売れた分の利益 = ${num(a)} × ${m} = ${yen(a * m)}、値引きして売れた分の利益 = ${num(b)} × ${rest} = ${yen(b * rest)}`,
        `利益の合計 = ${num(a * m)} + ${num(b * rest)} = ${yen(ans)}`,
        `答え: ${yen(ans)}`,
      ],
    }
  },
)

const generators: Generator[] = [
  markup,
  withTarget(costFromSale, 60),
  withTarget(profitRate, 50),
  withTarget(breakEven, 80),
  withTarget(bulk, 110),
]
export default generators
