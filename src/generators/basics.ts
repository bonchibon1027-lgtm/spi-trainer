import type { Generator } from '../types'
import { defineGenerator, retry } from './common'
import { shuffledChoices } from '../lib/choices'
import { frac, gcd, lcm, num, rawFrac, reduce } from '../lib/math'
import { BASES, R, decStr, mixedChoices, mixedSorted, pctStr, posInt } from './numeric-util'
import type { Rng } from '../lib/rng'

// 計算の基礎（ウォームアップ）。すべて難易度 1。
// 分数・小数・百分率の変換 / 「〜の何%」 / 歩合 / 比の簡単化 / 比例式 / 分数の四則

// ---------------------------------------------------------------------------
// 1. 分数・小数・百分率の変換
// ---------------------------------------------------------------------------

type Dir = 'f2d' | 'f2p' | 'd2f' | 'p2f' | 'p2d' | 'd2p'

const CONV_DEN = [2, 4, 5, 8, 10, 20, 25, 40, 50]

/** 分母 d が 10 の何乗の約数になるか（小数の桁数） */
function decimalPlaces(d: number): number {
  let k = 1
  while (10 ** k % d !== 0) k++
  return k
}

/** 分数の選択肢（値の小さい順）。正解は n/d */
function fractionChoices(rng: Rng, n: number, d: number) {
  const cands: [number, number][] = [
    [d, n], // 分母と分子を逆にした
    [n, d * 10], // 小数点の位置を1つ間違えた
    [n * 10, d],
    [d - n, d], // 1 から引いてしまった
    [n + 1, d],
    [n, d + 1],
    [n, d * 2],
    [n - 1, d],
    [n, d - 1],
    [n + 2, d],
    [n, d + 2],
    [n * 2, d],
  ]
  return mixedSorted(
    rng,
    { label: frac(n, d), value: n / d },
    cands.filter(([x, y]) => x > 0 && y > 0).map(([x, y]) => ({ label: frac(x, y), value: x / y })),
  )
}

const convert = defineGenerator(
  { id: 'nv-basics/convert', topic: 'nv-basics', difficulty: 1, label: '分数・小数・百分率の変換' },
  (rng) => {
    const dir = rng.pick<Dir>(['f2d', 'f2p', 'd2f', 'p2f', 'p2d', 'd2p'])
    const { n, d } = retry(
      rng,
      (r) => {
        const d = r.pick(CONV_DEN)
        const maxN = r.chance(0.2) ? Math.floor(d * 1.5) : d - 1
        return { n: r.int(1, maxN), d }
      },
      ({ n, d }) => gcd(n, d) === 1,
    )
    const k = decimalPlaces(d)
    const scale = 10 ** k
    const f = scale / d // 分母を scale にするためにかける数
    const m = n * f // 小数を「scale 分の m」と見たときの m
    const c = m / scale // 小数の値
    const dec = decStr(c)
    const pctVal = (m * 100) / scale
    const pct = pctStr(pctVal)
    const fracText = frac(n, d)

    // 分数 → 小数 の途中式
    const toDecimal =
      f === 1
        ? [`分母が10なので、そのまま小数で書ける。${fracText} = ${dec}`]
        : [
            `分母 ${d} を ${num(scale)} にそろえるため、分子と分母に ${f} をかける（${d} × ${f} = ${num(scale)}）。`,
            `分子は ${n} × ${f} = ${m} なので、${fracText} = ${rawFrac(m, scale)}`,
            `${rawFrac(m, scale)} = ${dec}`,
          ]

    if (dir === 'f2d') {
      const { choices, answer } = mixedChoices(
        rng,
        c,
        [c * 10, c / 10, parseFloat(`0.${n}${d}`), Math.abs(1 - c), c * 100].map(R),
        { format: decStr, padStep: 0.05 },
      )
      return {
        stem: `${fracText} を小数で表すといくつか。`,
        choices,
        answer,
        hint: '分母を10、100、1000のどれかにそろえると、小数に直しやすくなります。',
        explanation: [
          '分数を小数に直すには、分母を10、100、1000のどれかにそろえる（分子 ÷ 分母を計算してもよい）。',
          ...toDecimal,
          `答え: ${dec}`,
        ],
      }
    }

    if (dir === 'f2p') {
      const { choices, answer } = mixedChoices(
        rng,
        pctVal,
        [pctVal * 10, pctVal / 10, parseInt(`${n}${d}`, 10), Math.abs(100 - pctVal), pctVal * 2].map(R),
        {
          format: pctStr,
          padStep: pctVal >= 20 ? 5 : 1,
          isValid: (x) => x > 0 && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6,
        },
      )
      return {
        stem: `${fracText} を百分率で表すと何%か。`,
        choices,
        answer,
        hint: 'まず小数に直し、その小数を100倍して「%」をつけます。',
        explanation: [
          '百分率は、小数を100倍して「%」をつけたもの。分数 → 小数 → 百分率の順に直す。',
          ...toDecimal,
          `${dec} × 100 = ${pct}`,
          `答え: ${pct}`,
        ],
      }
    }

    if (dir === 'd2f' || dir === 'p2f') {
      const { choices, answer } = fractionChoices(rng, n, d)
      const g = f
      if (dir === 'd2f') {
        return {
          stem: `${dec} を、これ以上約分できない分数で表すとどれか。`,
          choices,
          answer,
          hint: '小数の桁数にあわせて、分母を10、100、1000にします。そのあと約分します。',
          explanation: [
            `小数第${k}位までなので、分母を${num(scale)}にして分数に直す。`,
            g === 1 ? `${dec} = ${fracText}` : `${dec} = ${rawFrac(m, scale)}`,
            ...(g === 1
              ? []
              : [
                  `分子と分母を、最大公約数の ${g} で割って約分する。`,
                  `${m} ÷ ${g} = ${n}、${num(scale)} ÷ ${g} = ${d} なので、${rawFrac(m, scale)} = ${fracText}`,
                ]),
            `答え: ${fracText}`,
          ],
        }
      }
      // p2f
      const steps: string[] = []
      if (k <= 2) {
        const p = m * 10 ** (2 - k)
        const gg = gcd(p, 100)
        steps.push(`百分率は「100を分母にした分数」と同じ。${pct} = ${rawFrac(p, 100)}`)
        if (gg > 1) {
          steps.push(`${p} と 100 の最大公約数は ${gg}。分子と分母を ${gg} で割って約分する。`)
          steps.push(`${p} ÷ ${gg} = ${n}、100 ÷ ${gg} = ${d} なので、${rawFrac(p, 100)} = ${fracText}`)
        }
      } else {
        steps.push(`${pct} は ${decStr(pctVal)} ÷ 100。分子に小数点があるので、分子と分母を10倍して整数にする。`)
        steps.push(`${decStr(pctVal)} ÷ 100 = ${rawFrac(m, 1000)}`)
        steps.push(`${m} と 1000 の最大公約数は ${f}。分子と分母を ${f} で割って約分する。`)
        steps.push(`${m} ÷ ${f} = ${n}、1000 ÷ ${f} = ${d} なので、${rawFrac(m, 1000)} = ${fracText}`)
      }
      return {
        stem: `${pct} を、これ以上約分できない分数で表すとどれか。`,
        choices,
        answer,
        hint: '百分率は「100分のいくつ」です。100を分母にして、約分します。',
        explanation: [...steps, `答え: ${fracText}`],
      }
    }

    if (dir === 'p2d') {
      const { choices, answer } = mixedChoices(
        rng,
        c,
        [c * 10, c / 10, c / 100, pctVal].map(R),
        { format: decStr, padStep: 0.05 },
      )
      return {
        stem: `${pct} を小数で表すといくつか。`,
        choices,
        answer,
        hint: '百分率の「%」を取って、100で割ります（小数点を左に2つ動かします）。',
        explanation: [
          '百分率を小数に直すには、「%」を取って100で割る（小数点を左に2つ動かす）。',
          `${decStr(pctVal)} ÷ 100 = ${dec}`,
          `答え: ${dec}`,
        ],
      }
    }

    // d2p
    const { choices, answer } = mixedChoices(
      rng,
      pctVal,
      [pctVal * 10, pctVal / 10, c, Math.abs(100 - pctVal)].map(R),
      {
        format: pctStr,
        padStep: pctVal >= 20 ? 5 : 1,
        isValid: (x) => x > 0 && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6,
      },
    )
    return {
      stem: `${dec} を百分率で表すと何%か。`,
      choices,
      answer,
      hint: '小数を100倍して「%」をつけます（小数点を右に2つ動かします）。',
      explanation: [
        '小数を百分率に直すには、100をかけて「%」をつける（小数点を右に2つ動かす）。',
        `${dec} × 100 = ${pct}`,
        `答え: ${pct}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 2. 「Xのy%はいくつ」「全体のy%がA → 全体は」
// ---------------------------------------------------------------------------

const UNITS = ['円', '人', '個'] as const

const percentOf = defineGenerator(
  { id: 'nv-basics/percent-of', topic: 'nv-basics', difficulty: 1, label: '「〜の何%」と、もとの量の逆算' },
  (rng) => {
    const u = rng.pick(UNITS)
    const fmt = (n: number) => `${num(n)}${u}`

    if (rng.chance(0.65)) {
      // X の y% はいくつ
      const x = rng.pick(BASES)
      const y = rng.chance(0.12) ? rng.pick([120, 150]) : 5 * rng.int(1, 19)
      const ans = (x * y) / 100
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [
          (x * y) / 10, // 小数点の位置を間違えた
          (x * y) / 1000,
          y < 100 ? (x * (100 - y)) / 100 : x + ans, // 残りの割合で計算した
          x + ans, // 増やしてしまった
          (x * 100) / y, // 割る向きを間違えた
        ].map(R),
        { format: fmt, padStep: Math.max(1, Math.round(ans * 0.1)), isValid: posInt },
      )
      return {
        stem: `${fmt(x)}の${y}%は何${u}か。`,
        choices,
        answer,
        hint: `「${y}%」を小数に直して、${num(x)}にかけます。5%分を先に求めると計算が楽です。`,
        explanation: [
          `「${fmt(x)}の${y}%」は、${num(x)} × ${decStr(y / 100)} で求める（${y}% = ${decStr(y / 100)}）。`,
          `5%にあたる量 = ${num(x)} ÷ 20 = ${num(x / 20)}`,
          `${y}%は5%の ${y / 5} 倍なので、${num(x / 20)} × ${y / 5} = ${num(ans)}`,
          `答え: ${fmt(ans)}`,
        ],
      }
    }

    // 全体の y% が A のとき、全体は
    const y = rng.pick([10, 20, 25, 40, 50, 60, 75, 80])
    const x = rng.pick(BASES)
    const a = (x * y) / 100
    const [rn, rd] = reduce(y, 100)
    const { choices, answer } = mixedChoices(
      rng,
      x,
      [
        (a * y) / 100, // さらに y% をかけてしまった
        (a * (100 - y)) / 100,
        a + (a * y) / 100,
        (a * 100) / (100 - y),
        (a * y) / 10,
      ].map(R),
      { format: fmt, padStep: Math.max(1, Math.round(x * 0.1)), isValid: posInt },
    )
    const calc =
      rn === 1
        ? [`${num(a)} × ${rd} = ${num(x)}`]
        : [`${num(a)} ÷ ${rn} = ${num(a / rn)}`, `${num(a / rn)} × ${rd} = ${num(x)}`]
    return {
      stem: `全体の${y}%が${fmt(a)}であるとき、全体は何${u}か。`,
      choices,
      answer,
      hint: `全体を□とすると、□ × ${decStr(y / 100)} = ${num(a)} という式になります。`,
      explanation: [
        `全体を□とすると、□ × ${decStr(y / 100)} = ${num(a)}。つまり □ = ${num(a)} ÷ ${decStr(y / 100)}。`,
        `${y}% = ${rawFrac(rn, rd)} なので、□ = ${num(a)} ÷ ${rawFrac(rn, rd)} = ${num(a)} × ${frac(rd, rn)}（わる数の分子と分母を入れかえてかける）`,
        ...calc,
        `答え: ${fmt(x)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 3. AはBの何%か
// ---------------------------------------------------------------------------

const percentRate = defineGenerator(
  { id: 'nv-basics/percent-rate', topic: 'nv-basics', difficulty: 1, label: '「AはBの何%か」（割合を求める）' },
  (rng) => {
    const u = rng.pick(UNITS)
    const fmt = (n: number) => `${num(n)}${u}`
    const b = rng.pick(BASES)
    const p = rng.chance(0.15) ? rng.pick([120, 150]) : 5 * rng.int(1, 19)
    const a = (b * p) / 100
    const [rn, rd] = reduce(a, b)
    const cleanOneDecimal = (x: number) => Math.abs(x * 10 - Math.round(x * 10)) < 1e-6
    const recip = (b / a) * 100
    const { choices, answer } = mixedChoices(
      rng,
      p,
      [
        cleanOneDecimal(recip) ? recip : p * 10, // 割る数と割られる数を逆にした
        p / 10,
        p < 100 ? 100 - p : p - 100,
        p * 10,
        R(a / b), // 100倍し忘れた
      ].map(R),
      {
        format: pctStr,
        padStep: p >= 20 ? 5 : 1,
        isValid: (x) => x > 0 && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6,
      },
    )
    const toPct =
      rd === 100
        ? [`${rawFrac(a, b)} = ${p}%`]
        : [
            `分母 ${rd} を 100 にするには ${100 / rd} 倍すればよいので、分子も ${100 / rd} 倍して ${frac(rn, rd)} = ${rawFrac(p, 100)} = ${p}%`,
          ]
    return {
      stem: `${fmt(a)}は${fmt(b)}の何%か。`,
      choices,
      answer,
      hint: '「〜の」の前にある量（ここでは後ろの数）がもとにする量です。比べる量 ÷ もとにする量 で割合が出ます。',
      explanation: [
        `割合 = 比べる量 ÷ もとにする量。「${fmt(b)}の」とあるので、もとにする量は ${num(b)}、比べる量は ${num(a)}。`,
        `${num(a)} ÷ ${num(b)} = ${rawFrac(a, b)}${gcd(a, b) > 1 ? ` = ${frac(rn, rd)}（${gcd(a, b)} で約分）` : ''}`,
        ...toPct,
        `答え: ${pctStr(p)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 4. 歩合（3割5分 = 35% = 0.35）
// ---------------------------------------------------------------------------

/** 整数の百分率 p (1〜99) を「x割y分」の形にする */
function wari(p: number): string {
  const a = Math.floor(p / 10)
  const b = p % 10
  return `${a > 0 ? `${a}割` : ''}${b > 0 ? `${b}分` : ''}`
}

const waribu = defineGenerator(
  { id: 'nv-basics/waribu', topic: 'nv-basics', difficulty: 1, label: '歩合（割・分・厘）と百分率' },
  (rng) => {
    const v = rng.next()

    if (v < 0.4) {
      // 「x割y分z厘」→ %
      const { a, b, c } = retry(
        rng,
        (r) => ({ a: r.int(0, 9), b: r.int(0, 9), c: r.chance(0.3) ? r.int(1, 9) : 0 }),
        ({ a, b, c }) => (a > 0 || b > 0) && (c === 0 || b > 0),
      )
      const p = R(10 * a + b + c / 10)
      const text = `${a > 0 ? `${a}割` : ''}${b > 0 ? `${b}分` : ''}${c > 0 ? `${c}厘` : ''}`
      const { choices, answer } = mixedChoices(
        rng,
        p,
        [p / 10, p * 10, R(10 * a + b / 10 + c / 100), 10 * a, 10 * b + a].map(R),
        { format: pctStr, padStep: p >= 20 ? 5 : 1 },
      )
      const terms: string[] = []
      const parts: string[] = []
      if (a > 0) {
        terms.push(`${a}割 = ${10 * a}%`)
        parts.push(`${10 * a}%`)
      }
      if (b > 0) {
        terms.push(`${b}分 = ${b}%`)
        parts.push(`${b}%`)
      }
      if (c > 0) {
        terms.push(`${c}厘 = ${decStr(c / 10)}%`)
        parts.push(`${decStr(c / 10)}%`)
      }
      return {
        stem: `歩合で「${text}」と表される割合は、百分率で表すと何%か。`,
        choices,
        answer,
        hint: '1割 = 10%、1分 = 1%、1厘 = 0.1% です。',
        explanation: [
          '歩合の単位は、1割 = 10%、1分 = 1%、1厘 = 0.1%（= 0.001）と覚える。',
          terms.join('、'),
          `${parts.join(' + ')} = ${pctStr(p)}`,
          `答え: ${pctStr(p)}`,
        ],
      }
    }

    if (v < 0.75) {
      // X の x割y分 はいくつ
      const u = rng.pick(UNITS)
      const fmt = (n: number) => `${num(n)}${u}`
      const p = 5 * rng.int(2, 19) // 10〜95
      const x = rng.pick(BASES)
      const ans = (x * p) / 100
      const a = Math.floor(p / 10)
      const b = p % 10
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [(x * p) / 10, (x * p) / 1000, (x * (100 - p)) / 100, (x * (10 * a + b / 10)) / 100].map(R),
        { format: fmt, padStep: Math.max(1, Math.round(ans * 0.1)), isValid: posInt },
      )
      return {
        stem: `${fmt(x)}の${wari(p)}は何${u}か。`,
        choices,
        answer,
        hint: '歩合を百分率に直してから計算します。1割 = 10%、1分 = 1% です。',
        explanation: [
          `1割 = 10%、1分 = 1% なので、${wari(p)} = ${p}% = ${decStr(p / 100)}。`,
          `5%にあたる量 = ${num(x)} ÷ 20 = ${num(x / 20)}`,
          `${p}%は5%の ${p / 5} 倍なので、${num(x / 20)} × ${p / 5} = ${num(ans)}`,
          `答え: ${fmt(ans)}`,
        ],
      }
    }

    // p% を歩合で
    const p = retry(
      rng,
      (r) => r.int(11, 99),
      (x) => x % 10 !== 0,
    )
    const a = Math.floor(p / 10)
    const b = p % 10
    const correct = wari(p)
    const { choices, answer } = shuffledChoices(
      rng,
      correct,
      [
        wari(10 * b + a), // 十の位と一の位を取りちがえた
        `${a}分${b}厘`, // 一つ下の単位で読んだ
        `${a}割${b}厘`,
        `${a < 9 ? a + 1 : a - 1}割${b}分`,
        `${a}割${b < 9 ? b + 1 : b - 1}分`,
        `${a}割`,
      ],
    )
    return {
      stem: `${p}%を、歩合（「割」と「分」）で表すとどれか。`,
      choices,
      answer,
      hint: '10%が1割、1%が1分です。十の位が「割」、一の位が「分」になります。',
      explanation: [
        '1割 = 10%、1分 = 1% なので、百分率を10でわって考える。',
        `${p} ÷ 10 = ${a} あまり ${b} だから、${p}% = 10%が${a}個 + 1%が${b}個。`,
        `${a}割 + ${b}分 = ${correct}`,
        `答え: ${correct}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 5. 比の簡単化と比の値
// ---------------------------------------------------------------------------

const ratioStr = (x: number, y: number) => `${x}:${y}`
const reducedRatio = (x: number, y: number) => {
  const [rx, ry] = reduce(x, y)
  return ratioStr(rx, ry)
}
/** (p, q) に近い、これ以上約分できない比の候補（ランダムに並べて返す） */
function nearbyRatios(rng: Rng, p: number, q: number): string[] {
  const out: string[] = []
  for (let dp = -2; dp <= 2; dp++) {
    for (let dq = -2; dq <= 2; dq++) {
      const a = p + dp
      const b = q + dq
      if (dp === 0 && dq === 0) continue
      if (a < 1 || b < 1 || a > 12 || b > 12 || a === b || gcd(a, b) !== 1) continue
      if (a === q && b === p) continue
      out.push(ratioStr(a, b))
    }
  }
  return rng.shuffle(out)
}
const smallestFactor = (n: number) => {
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return i
  return n
}

const ratioSimplify = defineGenerator(
  { id: 'nv-basics/ratio-simplify', topic: 'nv-basics', difficulty: 1, label: '比の簡単化と比の値' },
  (rng) => {
    const v = rng.next()

    if (v < 0.4) {
      // 整数の比
      const { p, q } = retry(
        rng,
        (r) => ({ p: r.int(1, 9), q: r.int(1, 9) }),
        ({ p, q }) => p !== q && gcd(p, q) === 1,
      )
      const g = rng.int(2, 12)
      const A = p * g
      const B = q * g
      const h = smallestFactor(g)
      const partial = h < g ? [ratioStr(p * h, q * h)] : []
      const correct = ratioStr(p, q)
      const { choices, answer } = shuffledChoices(rng, correct, [
        ratioStr(q, p),
        ...partial,
        ...nearbyRatios(rng, p, q),
      ])
      return {
        stem: `${A}:${B} を最も簡単な整数の比で表すとどれか。`,
        choices,
        answer,
        hint: '2つの数を、同じ数（最大公約数）で割ります。これ以上割れなくなるまで続けます。',
        explanation: [
          '比を簡単にするには、両方の数を最大公約数（2つの数をどちらも割りきれる最大の数）で割る。',
          `${A} と ${B} の最大公約数は ${g}。`,
          `${A} ÷ ${g} = ${p}、${B} ÷ ${g} = ${q}`,
          `答え: ${correct}`,
        ],
      }
    }

    if (v < 0.6) {
      // 小数の比
      const { p, q, gg } = retry(
        rng,
        (r) => ({ p: r.int(1, 9), q: r.int(1, 9), gg: r.int(1, 4) }),
        ({ p, q, gg }) => p !== q && gcd(p, q) === 1 && (p * gg) % 10 !== 0 && (q * gg) % 10 !== 0,
      )
      const a10 = p * gg
      const b10 = q * gg
      const correct = ratioStr(p, q)
      const { choices, answer } = shuffledChoices(rng, correct, [
        ratioStr(q, p),
        ...(gg > 1 ? [ratioStr(a10, b10)] : []),
        ...nearbyRatios(rng, p, q),
      ])
      return {
        stem: `${decStr(a10 / 10)}:${decStr(b10 / 10)} を最も簡単な整数の比で表すとどれか。`,
        choices,
        answer,
        hint: 'まず両方を10倍して小数をなくします。そのあと、最大公約数で割ります。',
        explanation: [
          '小数の比は、両方を10倍（または100倍）して整数にしてから簡単にする。',
          `${decStr(a10 / 10)} × 10 = ${a10}、${decStr(b10 / 10)} × 10 = ${b10} なので、${ratioStr(a10, b10)}`,
          ...(gg > 1
            ? [`${a10} と ${b10} の最大公約数は ${gg}。`, `${a10} ÷ ${gg} = ${p}、${b10} ÷ ${gg} = ${q}`]
            : [`${a10} と ${b10} はこれ以上割れないので、このまま。`]),
          `答え: ${correct}`,
        ],
      }
    }

    if (v < 0.85) {
      // 分数の比
      const { a, b, c, d } = retry(
        rng,
        (r) => ({ a: r.int(1, 3), b: r.int(2, 6), c: r.int(1, 3), d: r.int(2, 6) }),
        ({ a, b, c, d }) => {
          if (b === d || a >= b || c >= d) return false
          if (gcd(a, b) !== 1 || gcd(c, d) !== 1) return false
          const [rn, rd] = reduce(a * d, c * b)
          return rn !== rd && rn <= 12 && rd <= 12
        },
      )
      const L = lcm(b, d)
      const x = (a * L) / b
      const y = (c * L) / d
      const [rn, rd] = reduce(x, y)
      const correct = ratioStr(rn, rd)
      const { choices, answer } = shuffledChoices(rng, correct, [
        reducedRatio(b, d),
        reducedRatio(d, b),
        reducedRatio(a, c),
        ratioStr(rd, rn),
        ...nearbyRatios(rng, rn, rd),
      ])
      const g = gcd(x, y)
      return {
        stem: `${frac(a, b)} : ${frac(c, d)} を最も簡単な整数の比で表すとどれか。`,
        choices,
        answer,
        hint: '2つの分母の最小公倍数を、両方にかけると整数の比になります。',
        explanation: [
          '分数の比は、分母の最小公倍数を両方にかけて整数の比にする。',
          `${b} と ${d} の最小公倍数は ${L}。`,
          `${frac(a, b)} × ${L} = ${x}、${frac(c, d)} × ${L} = ${y} なので、${ratioStr(x, y)}`,
          ...(g > 1 ? [`${x} と ${y} の最大公約数は ${g}。${x} ÷ ${g} = ${rn}、${y} ÷ ${g} = ${rd}`] : []),
          `答え: ${correct}`,
        ],
      }
    }

    // 比の値（AはBの何倍か）
    const { p, q } = retry(
      rng,
      (r) => ({ p: r.int(1, 9), q: r.int(2, 9) }),
      ({ p, q }) => p !== q && gcd(p, q) === 1,
    )
    const g = rng.int(2, 9)
    const A = p * g
    const B = q * g
    const label = (n: number, d: number) => `${frac(n, d)}倍`
    const pairs: [number, number][] = [
      [q, p], // 逆に割った
      [p, p + q], // 全体に対する割合にしてしまった
      [q, p + q],
      [Math.abs(p - q), q],
      [p + q, q],
      [p, q + 1],
      [p + 1, q],
      [q + 1, p],
      [p, q + 2],
      [p + 2, q],
      [2 * p, q],
      [p, 2 * q],
    ]
    const { choices, answer } = mixedSorted(
      rng,
      { label: label(p, q), value: p / q },
      pairs.map(([a, b]) => ({ label: label(a, b), value: a / b })),
    )
    return {
      stem: `AとBの比が ${ratioStr(A, B)} のとき、Aの値はBの値の何倍か。`,
      choices,
      answer,
      hint: '「AはBの何倍か」は A ÷ B で求めます。分数にして約分しましょう。',
      explanation: [
        '「AはBの何倍か」（比の値）は、A ÷ B で求める。',
        `${A} ÷ ${B} = ${rawFrac(A, B)}`,
        `${A} と ${B} の最大公約数 ${g} で約分する。${rawFrac(A, B)} = ${frac(p, q)}`,
        `答え: ${label(p, q)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 6. 比例式（x : 12 = 3 : 4 の x）
// ---------------------------------------------------------------------------

const SOLVE_CTX = [
  { a: 'りんご', b: 'みかん', what: '個数', unit: '個', scale: 1 },
  { a: '男子', b: '女子', what: '人数', unit: '人', scale: 1 },
  { a: '兄', b: '弟', what: '持っている金額', unit: '円', scale: 100 },
  { a: '赤い玉', b: '白い玉', what: '数', unit: '個', scale: 1 },
] as const

const ratioSolve = defineGenerator(
  { id: 'nv-basics/ratio-solve', topic: 'nv-basics', difficulty: 1, label: '比例式（x : 12 = 3 : 4 の x）' },
  (rng) => {
    const { p, q } = retry(
      rng,
      (r) => ({ p: r.int(1, 9), q: r.int(1, 9) }),
      ({ p, q }) => p !== q && gcd(p, q) === 1,
    )
    const equation = rng.chance(0.5)
    const ctx = rng.pick(SOLVE_CTX)
    const g = rng.int(2, 12)
    const scale = equation ? 1 : ctx.scale
    const unitG = g * scale
    const askFirst = rng.chance(0.5) // 求めるのが比の前項（p 側）か
    const k = askFirst ? q : p // 与えられた側の比の数
    const t = askFirst ? p : q // 求める側の比の数
    const K = k * unitG
    const ans = t * unitG
    const fmt = equation ? (n: number) => num(n) : (n: number) => `${num(n)}${ctx.unit}`

    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        (K * k) / t, // 比を逆にして計算した
        K - k + t, // 差が同じと考えた（たし算・ひき算で考えた）
        K * t, // 割り忘れた
        unitG, // 1にあたる大きさを答えた
        K + t,
      ].map(R),
      { format: fmt, padStep: Math.max(1, Math.round(ans * 0.1)), isValid: posInt },
    )

    const stem = equation
      ? askFirst
        ? `x:${K}=${p}:${q} のとき、x の値はいくつか。`
        : `${K}:x=${p}:${q} のとき、x の値はいくつか。`
      : askFirst
        ? `${ctx.b}と${ctx.a}の${ctx.what}の比は ${q}:${p} である。${ctx.b}が${fmt(K)}のとき、${ctx.a}は何${ctx.unit}か。`
        : `${ctx.a}と${ctx.b}の${ctx.what}の比は ${p}:${q} である。${ctx.a}が${fmt(K)}のとき、${ctx.b}は何${ctx.unit}か。`

    const relation = equation
      ? askFirst
        ? `x:${K} = ${p}:${q}`
        : `${K}:x = ${p}:${q}`
      : `比 ${askFirst ? ratioStr(q, p) : ratioStr(p, q)}`
    return {
      stem,
      choices,
      answer,
      hint: '比が等しいとき、2つの数は同じ倍率で大きくなります。わかっている数が、比の数の何倍かを先に求めます。',
      explanation: [
        `${relation}。比が等しいとき、どちらの数も同じ倍率でふえる。`,
        `わかっている ${num(K)} は、比の ${k} の何倍か。${num(K)} ÷ ${k} = ${num(unitG)}`,
        `求める数も、比の ${t} の ${num(unitG)} 倍になる。${t} × ${num(unitG)} = ${num(ans)}`,
        `答え: ${fmt(ans)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 7. 分数の四則
// ---------------------------------------------------------------------------

const FR_DEN = [2, 3, 4, 5, 6, 8, 9, 10, 12]
type Fr = [number, number]

function pickFrac(r: { pick<T>(a: readonly T[]): T; int(a: number, b: number): number }): Fr {
  const d = r.pick(FR_DEN)
  return [r.int(1, d - 1), d]
}

/** 分数の選択肢（値の小さい順）。correct = [分子, 分母]、cands は間違い方で出る値 */
function fracCalcChoices(rng: Rng, correct: Fr, cands: Fr[]) {
  const [cn, cd] = correct
  const v = cn / cd
  const fillers: Fr[] = [
    [cn + 1, cd],
    [cn, cd + 1],
    [cn - 1, cd],
    [cn, cd - 1],
    [cn + 2, cd],
    [cn, cd + 2],
    [cn, cd * 2],
    [cn * 2, cd],
  ]
  return mixedSorted(
    rng,
    { label: frac(cn, cd), value: v },
    [...cands, ...fillers].filter(([a, b]) => a > 0 && b > 0).map(([a, b]) => ({ label: frac(a, b), value: a / b })),
  )
}

const fractionCalc = defineGenerator(
  { id: 'nv-basics/fraction-calc', topic: 'nv-basics', difficulty: 1, label: '分数の四則計算' },
  (rng) => {
    const op = rng.pick(['add', 'sub', 'mul', 'div'] as const)
    const sym = { add: '+', sub: '−', mul: '×', div: '÷' }[op]

    const made = retry(
      rng,
      (r) => {
        const f1 = pickFrac(r)
        const f2 = pickFrac(r)
        return { f1, f2 }
      },
      ({ f1: [a, b], f2: [c, d] }) => {
        if (gcd(a, b) !== 1 || gcd(c, d) !== 1) return false
        if (op === 'add' || op === 'sub') {
          if (b === d) return false
          const L = lcm(b, d)
          if (L > 24) return false
          const x = (a * L) / b
          const y = (c * L) / d
          const s = op === 'add' ? x + y : x - y
          if (s <= 0) return false
          const [rn, rd] = reduce(s, L)
          return rd > 1 && rn <= 40
        }
        const [rn, rd] = op === 'mul' ? reduce(a * c, b * d) : reduce(a * d, b * c)
        return rd > 1 && rd <= 20 && rn <= 20
      },
    )
    const [[a, b], [c, d]] = [made.f1, made.f2]
    const A = frac(a, b)
    const B = frac(c, d)
    const stem = `次の計算の答えとして正しいものはどれか。\n${A} ${sym} ${B}`

    if (op === 'add' || op === 'sub') {
      const L = lcm(b, d)
      const x = (a * L) / b
      const y = (c * L) / d
      const s = op === 'add' ? x + y : x - y
      const [rn, rd] = reduce(s, L)
      const label = frac(rn, rd)
      const cands: Fr[] =
        op === 'add'
          ? [[a + c, b + d], [a + c, L], [a * c, b * d], [Math.abs(x - y), L]]
          : [[a - c, b - d], [a - c, L], [x + y, L], [a * c, b * d]]
      const { choices, answer } = fracCalcChoices(rng, [rn, rd], cands)
      return {
        stem,
        choices,
        answer,
        hint: '分母がちがうので、まず通分（分母を同じ数にそろえること）します。',
        explanation: [
          `分母がちがう分数の${op === 'add' ? '足し算' : '引き算'}は、通分してから分子どうしを計算する。`,
          `${b} と ${d} の最小公倍数は ${L}。`,
          `${A} = ${rawFrac(x, L)}、${B} = ${rawFrac(y, L)}`,
          `${rawFrac(x, L)} ${sym} ${rawFrac(y, L)} = ${rawFrac(s, L)}`,
          ...(gcd(s, L) > 1 ? [`${s} と ${L} の最大公約数 ${gcd(s, L)} で約分する。${rawFrac(s, L)} = ${label}`] : []),
          `答え: ${label}`,
        ],
      }
    }

    // mul / div
    const num_ = op === 'mul' ? a * c : a * d
    const den_ = op === 'mul' ? b * d : b * c
    const [rn, rd] = reduce(num_, den_)
    const label = frac(rn, rd)
    const g = gcd(num_, den_)
    const cands: Fr[] =
      op === 'mul'
        ? [[a * d, b * c], [a * c, b + d], [a + c, b + d], [rd, rn]]
        : [[a * c, b * d], [rd, rn], [a * d, b * d], [a * c, b * c]]
    const { choices, answer } = fracCalcChoices(rng, [rn, rd], cands)
    return {
      stem,
      choices,
      answer,
      hint:
        op === 'mul'
          ? '分数のかけ算は、分子どうし・分母どうしをかけます。最後に約分しましょう。'
          : 'わり算は、わる数の分母と分子を入れかえて、かけ算に直します。',
      explanation:
        op === 'mul'
          ? [
              '分数のかけ算は、分子どうし・分母どうしをかける。',
              `分子は ${a} × ${c} = ${a * c}、分母は ${b} × ${d} = ${b * d} なので、${rawFrac(a * c, b * d)}`,
              ...(g > 1 ? [`${a * c} と ${b * d} の最大公約数 ${g} で約分する。${rawFrac(a * c, b * d)} = ${label}`] : []),
              `答え: ${label}`,
            ]
          : [
              '分数のわり算は、わる数の分母と分子を入れかえて、かけ算に直す。',
              `${A} ÷ ${B} = ${A} × ${frac(d, c)}`,
              `分子は ${a} × ${d} = ${a * d}、分母は ${b} × ${c} = ${b * c} なので、${rawFrac(a * d, b * c)}`,
              ...(g > 1 ? [`${a * d} と ${b * c} の最大公約数 ${g} で約分する。${rawFrac(a * d, b * c)} = ${label}`] : []),
              `答え: ${label}`,
            ],
    }
  },
)

const generators: Generator[] = [
  convert,
  percentOf,
  percentRate,
  waribu,
  ratioSimplify,
  ratioSolve,
  fractionCalc,
]
export default generators
