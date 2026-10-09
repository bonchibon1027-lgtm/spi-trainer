import type { Generator } from '../types'
import { defineGenerator, retry } from './common'
import { gcd, num, rawFrac, reduce, round, yen } from '../lib/math'
import { BASES, R, decStr, mixedChoices, okPct, pctStr, posInt, toPercentSteps, withTarget, withUnit } from './numeric-util'

// 割合と比
// 比の配分 / 部分と全体 / 割合の割合 / 増減率 / 連続する増減 / 食塩水の濃度

/** 100%未満の百分率（濃度や全体に対する割合で、100%を超える選択肢は不自然なので避ける） */
const okUnder100 = (n: number) => okPct(n) && n < 100

// ---------------------------------------------------------------------------
// 1. 比の配分（総額を a:b で分ける）
// ---------------------------------------------------------------------------

const NAMES = ['A', 'B', 'C']

const split = defineGenerator(
  { id: 'nv-ratio/split', topic: 'nv-ratio', difficulty: 1, label: '総額を比で分ける' },
  (rng) => {
    const three = rng.chance(0.3)
    const parts: number[] = three
      ? retry(
          rng,
          (r) => [r.int(1, 6), r.int(1, 6), r.int(1, 6)],
          (ps) => new Set(ps).size === 3 && gcd(gcd(ps[0], ps[1]), ps[2]) === 1,
        )
      : retry(
          rng,
          (r) => [r.int(1, 8), r.int(1, 8)],
          (ps) => ps[0] !== ps[1] && gcd(ps[0], ps[1]) === 1,
        )
    const s = parts.reduce((a, b) => a + b, 0)
    const money = rng.chance(0.65)
    const g = money ? rng.step(100, 1000, 100) : rng.int(2, 12)
    const total = s * g
    const fmt = money ? yen : (n: number) => `${num(n)}個`
    const t = rng.int(0, parts.length - 1)
    const ratioText = parts.join(':')
    const who = parts.length === 2 ? 'AさんとBさん' : 'AさんとBさんとCさん'
    const lead = money
      ? `${yen(total)}を、${who}で ${ratioText} の割合で分けた。`
      : `${num(total)}個のあめを、${who}で ${ratioText} の割合で分けた。`

    const askDiff = rng.chance(0.3)
    const sumText = `${parts.join(' + ')} = ${s}`
    if (!askDiff) {
      const ans = parts[t] * g
      const others = parts.map((p) => p * g).filter((_, i) => i !== t)
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [
          ...others, // 別の人の取り分を答えた
          g, // 比の1にあたる大きさを答えた
          (total * parts[t]) / parts.filter((_, i) => i !== t).reduce((a, b) => a + b, 0), // 合計でなく残りで割った
          total / parts[t],
        ].map(R),
        { format: fmt, padStep: money ? 100 : Math.max(1, Math.round(ans * 0.1)), isValid: posInt },
      )
      return {
        stem: `${lead}${NAMES[t]}さんの取り分は${money ? 'いくら' : '何個'}か。`,
        choices,
        answer,
        hint: '比の合計で全体を割ると、比の「1」にあたる大きさが出ます。',
        explanation: [
          `比の合計を求める。${sumText}`,
          `比の「1」にあたる大きさ = ${num(total)} ÷ ${s} = ${num(g)}`,
          `${NAMES[t]}さんの比は ${parts[t]} なので、${num(g)} × ${parts[t]} = ${num(ans)}`,
          `答え: ${fmt(ans)}`,
        ],
      }
    }

    const mx = Math.max(...parts)
    const mn = Math.min(...parts)
    const ans = (mx - mn) * g
    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [mx * g, mn * g, g, total / (mx - mn)].map(R),
      { format: fmt, padStep: money ? 100 : Math.max(1, Math.round(ans * 0.1)), isValid: posInt },
    )
    const big = NAMES[parts.indexOf(mx)]
    const small = NAMES[parts.indexOf(mn)]
    return {
      stem: `${lead}${big}さんの取り分は、${small}さんの取り分より${money ? 'いくら' : '何個'}多いか。`,
      choices,
      answer,
      hint: '先に比の「1」にあたる大きさを求めます。差は、比の差の何個分かで考えます。',
      explanation: [
        `比の合計を求める。${sumText}`,
        `比の「1」にあたる大きさ = ${num(total)} ÷ ${s} = ${num(g)}`,
        `${big}さんと${small}さんの比の差は ${mx} − ${mn} = ${mx - mn}`,
        `取り分の差 = ${num(g)} × ${mx - mn} = ${num(ans)}`,
        `答え: ${fmt(ans)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 2. 部分と全体（比と片方の量から全体を求める）
// ---------------------------------------------------------------------------

const PW_CTX = [
  { a: '男子', b: '女子', place: 'あるクラス', what: '人数', unit: '人', total: 'クラスの生徒' },
  { a: '大人', b: '子ども', place: 'ある遊園地', what: '入場者数', unit: '人', total: '入場者' },
  { a: '赤い玉', b: '白い玉', place: '箱の中', what: '個数', unit: '個', total: '玉' },
  { a: '営業部', b: '総務部', place: 'ある会社', what: '人数', unit: '人', total: '2つの部の社員' },
] as const

const partWhole = defineGenerator(
  { id: 'nv-ratio/part-whole', topic: 'nv-ratio', difficulty: 1, label: '比と一部の量から全体を求める' },
  (rng) => {
    if (rng.chance(0.25)) {
      // 3つの比
      const parts = retry(
        rng,
        (r) => [r.int(1, 6), r.int(1, 6), r.int(1, 6)],
        (ps) => new Set(ps).size === 3 && gcd(gcd(ps[0], ps[1]), ps[2]) === 1,
      )
      const s = parts.reduce((a, b) => a + b, 0)
      const g = rng.int(2, 15)
      const known = rng.int(0, 2)
      const names = ['A組', 'B組', 'C組']
      const fmt = withUnit('人')
      const m = parts[known] * g
      const total = s * g
      const { choices, answer } = mixedChoices(
        rng,
        total,
        [m * s, m + (s - parts[known]), (s - parts[known]) * g, total - g, total + g].map(R),
        { format: fmt, padStep: Math.max(1, g), isValid: posInt },
      )
      return {
        stem: `ある学年のA組、B組、C組の人数の比は ${parts.join(':')} で、${names[known]}は${fmt(m)}である。この学年の生徒は全部で何人か。`,
        choices,
        answer,
        hint: 'わかっている組の人数を、その組の比の数で割ると、比の「1」にあたる人数が出ます。',
        explanation: [
          `${names[known]}の比は ${parts[known]} で、人数は ${m}人。比の「1」にあたる人数 = ${m} ÷ ${parts[known]} = ${g}人`,
          `比の合計 = ${parts.join(' + ')} = ${s}`,
          `全体 = ${g} × ${s} = ${num(total)}人`,
          `答え: ${fmt(total)}`,
        ],
      }
    }

    const c = rng.pick(PW_CTX)
    const { p, q } = retry(
      rng,
      (r) => ({ p: r.int(1, 9), q: r.int(1, 9) }),
      ({ p, q }) => p !== q && gcd(p, q) === 1,
    )
    const g = rng.int(2, 15)
    const fmt = withUnit(c.unit)
    const s = p + q
    const askA = rng.chance(0.5) // わかっているのが a の量か
    const k = askA ? p : q // わかっている側の比の数
    const o = askA ? q : p // もう一方の比の数
    const known = askA ? c.a : c.b
    const other = askA ? c.b : c.a
    const m = k * g
    const v = rng.next()

    if (v < 0.6) {
      const total = s * g
      const { choices, answer } = mixedChoices(
        rng,
        total,
        [m * s, m + o, o * g, (m * s) / o, total - g].map(R),
        { format: fmt, padStep: Math.max(1, g), isValid: posInt },
      )
      return {
        stem: `${c.place}の${c.a}と${c.b}の${c.what}の比は ${p}:${q} で、${known}は${fmt(m)}である。${c.total}は全部で何${c.unit}か。`,
        choices,
        answer,
        hint: `わかっている${known}の量を、その比の数 ${k} で割ると、比の「1」にあたる量が出ます。`,
        explanation: [
          `${known}の比は ${k} で、量は ${num(m)}${c.unit}。比の「1」にあたる量 = ${num(m)} ÷ ${k} = ${num(g)}${c.unit}`,
          `比の合計 = ${p} + ${q} = ${s}`,
          `全体 = ${num(g)} × ${s} = ${num(total)}${c.unit}`,
          `答え: ${fmt(total)}`,
        ],
      }
    }

    if (v < 0.85) {
      const ans = o * g
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [m + o, m - o + k, (m * k) / o, s * g, m * o].map(R),
        { format: fmt, padStep: Math.max(1, g), isValid: (x) => posInt(x) && x !== m },
      )
      return {
        stem: `${c.place}の${c.a}と${c.b}の${c.what}の比は ${p}:${q} で、${known}は${fmt(m)}である。${other}は何${c.unit}か。`,
        choices,
        answer,
        hint: '比の「1」にあたる量を先に求めてから、求めたい方の比の数をかけます。',
        explanation: [
          `${known}の比は ${k} で、量は ${num(m)}${c.unit}。比の「1」にあたる量 = ${num(m)} ÷ ${k} = ${num(g)}${c.unit}`,
          `${other}の比は ${o} なので、${num(g)} × ${o} = ${num(ans)}${c.unit}`,
          `答え: ${fmt(ans)}`,
        ],
      }
    }

    const ans = Math.abs(p - q) * g
    const bigName = p > q ? c.a : c.b
    const smallName = p > q ? c.b : c.a
    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [g, m, s * g, Math.max(p, q) * g, Math.min(p, q) * g].map(R),
      { format: fmt, padStep: Math.max(1, g), isValid: posInt },
    )
    return {
      stem: `${c.place}の${c.a}と${c.b}の${c.what}の比は ${p}:${q} で、${known}は${fmt(m)}である。${bigName}は${smallName}より何${c.unit}多いか。`,
      choices,
      answer,
      hint: '比の「1」にあたる量を求めて、比の差の何個分かを考えます。',
      explanation: [
        `${known}の比は ${k} で、量は ${num(m)}${c.unit}。比の「1」にあたる量 = ${num(m)} ÷ ${k} = ${num(g)}${c.unit}`,
        `比の差 = ${Math.max(p, q)} − ${Math.min(p, q)} = ${Math.abs(p - q)}`,
        `差 = ${num(g)} × ${Math.abs(p - q)} = ${num(ans)}${c.unit}`,
        `答え: ${fmt(ans)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 3. 割合の割合
// ---------------------------------------------------------------------------

const ROR_CTX = [
  {
    head: 'ある会社の社員',
    noun: '社員',
    unit: '人',
    first: '営業部に所属している',
    mid: '営業部の社員',
    second: '女性である',
    target: '営業部の女性社員',
  },
  {
    head: 'ある学校の生徒',
    noun: '生徒',
    unit: '人',
    first: '運動部に入っている',
    mid: '運動部の生徒',
    second: '3年生である',
    target: '運動部の3年生',
  },
  {
    head: 'あるイベントの来場者',
    noun: '来場者',
    unit: '人',
    first: '女性である',
    mid: '女性の来場者',
    second: '20代である',
    target: '20代の女性の来場者',
  },
  {
    head: '倉庫にある商品',
    noun: '商品',
    unit: '個',
    first: '国産である',
    mid: '国産の商品',
    second: '食品である',
    target: '国産の食品',
  },
] as const

const PCTS = [10, 20, 25, 30, 40, 50, 60, 75, 80]

const ratioOfRatio = defineGenerator(
  { id: 'nv-ratio/ratio-of-ratio', topic: 'nv-ratio', difficulty: 2, label: '割合の割合（全体の何%のうちの何%）' },
  (rng) => {
    const c = rng.pick(ROR_CTX)
    const fmt = withUnit(c.unit)
    const v = rng.next()
    const { T, a, b } = retry(
      rng,
      (r) => ({ T: 100 * r.int(2, 20), a: r.pick(PCTS), b: r.pick(PCTS) }),
      ({ T, a, b }) => (T * a * b) % 10000 === 0 && (T * a * b) / 10000 >= 10,
    )
    const mid = (T * a) / 100
    const ans = (mid * b) / 100
    const part1 = `${c.first}`

    if (v < 0.4) {
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [(T * (a + b)) / 100, mid, (T * b) / 100, T * Math.abs(a - b) / 100, (T * a * b) / 100000].map(R),
        { format: fmt, padStep: Math.max(1, Math.round(ans * 0.1)), isValid: posInt },
      )
      return {
        stem: `${c.head}は${fmt(T)}である。そのうち${a}%が${part1}。${c.mid}のうち${b}%が${c.second}。${c.target}は何${c.unit}か。`,
        choices,
        answer,
        hint: '2段階で考えます。先に全体の何%かを人数に直し、その人数に次の割合をかけます。',
        explanation: [
          `1段階目: 全体の${a}%が${part1}。${num(T)} × ${decStr(a / 100)} = ${num(mid)}${c.unit}`,
          `2段階目: ${c.mid}${num(mid)}${c.unit}のうち${b}%が${c.second}。${num(mid)} × ${decStr(b / 100)} = ${num(ans)}${c.unit}`,
          `答え: ${fmt(ans)}`,
        ],
      }
    }

    if (v < 0.7) {
      const [rn, rd] = reduce(b, 100)
      const { choices, answer } = mixedChoices(
        rng,
        T,
        [mid, (ans * 100) / b, (ans * 100) / (a + b), (ans * 100) / a, T / 10].map(R),
        { format: fmt, padStep: Math.max(1, Math.round(T * 0.1)), isValid: posInt },
      )
      const [an, ad] = reduce(a, 100)
      return {
        stem: `${c.head}のうち${a}%が${part1}。${c.mid}のうち${b}%が${c.second}。${c.target}は${fmt(ans)}である。${c.noun}は全部で何${c.unit}か。`,
        choices,
        answer,
        hint: '2段階の割合を逆にたどります。小さい方の人数から、「もとにする量」を順にもとめます。',
        explanation: [
          `まず${c.mid}の人数（もとにする量）を求める。${c.mid}を□とすると、□ × ${decStr(b / 100)} = ${num(ans)}`,
          `${b}% = ${rawFrac(rn, rd)} なので、□ = ${num(ans)} ÷ ${rn} × ${rd} = ${num(mid)}${c.unit}`,
          `次に全体を求める。全体を△とすると、△ × ${decStr(a / 100)} = ${num(mid)}`,
          `${a}% = ${rawFrac(an, ad)} なので、△ = ${num(mid)} ÷ ${an} × ${ad} = ${num(T)}${c.unit}`,
          `答え: ${fmt(T)}`,
        ],
      }
    }

    const p = (a * b) / 100
    const { choices, answer } = mixedChoices(
      rng,
      p,
      [a + b, Math.abs(a - b), (a * b) / 10, (a + b) / 2, a * b].map(R),
      { format: pctStr, padStep: p >= 10 ? 5 : 1, isValid: okUnder100 },
    )
    return {
      stem: `${c.head}のうち${a}%が${part1}。${c.mid}のうち${b}%が${c.second}。${c.target}は、${c.noun}全体の何%か。`,
      choices,
      answer,
      hint: '全体を100とおいて、2段階で考えます。割合どうしをかけてもかまいません。',
      explanation: [
        `全体を100とすると、${part1}のは 100 × ${decStr(a / 100)} = ${a}`,
        `そのうち${b}%が${c.second}ので、${a} × ${decStr(b / 100)} = ${decStr(p)}`,
        `全体100のうちの${decStr(p)}なので、${pctStr(p)}。（割合どうしをかけて ${decStr(a / 100)} × ${decStr(b / 100)} = ${decStr(p / 100)} としても同じ）`,
        `答え: ${pctStr(p)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 4. 増減率
// ---------------------------------------------------------------------------

const RC_CTX = [
  { thing: '来場者数', unit: '人' },
  { thing: '売上', unit: '万円' },
  { thing: '生産台数', unit: '台' },
  { thing: '応募者数', unit: '人' },
  { thing: '問い合わせ件数', unit: '件' },
] as const

const rateChange = defineGenerator(
  { id: 'nv-ratio/rate-change', topic: 'nv-ratio', difficulty: 2, label: '増減率（前年比）の計算と逆算' },
  (rng) => {
    const cx = rng.pick(RC_CTX)
    const fmt = withUnit(cx.unit)
    const up = rng.chance(0.55)
    const word = up ? '増' : '減'
    const v = rng.next()

    if (v < 0.3) {
      // 今年の値
      const p = rng.pick([5, 10, 15, 20, 25, 30, 40, 50])
      const X = rng.pick(BASES)
      const change = (X * p) / 100
      const Y = up ? X + change : X - change
      const { choices, answer } = mixedChoices(
        rng,
        Y,
        [
          up ? X + p : X - p, // 割合をそのまま足し引きした
          change, // 増減した分だけを答えた
          up ? X - change : X + change, // 向きを逆にした
          up ? (X * (100 + p)) / 10 : (X * (100 - p)) / 10,
        ].map(R),
        { format: fmt, padStep: Math.max(1, Math.round(Y * 0.05)), isValid: posInt },
      )
      return {
        stem: `${cx.thing}は前年が${fmt(X)}で、今年は前年比${p}%${word}であった。今年の${cx.thing}は何${cx.unit}か。`,
        choices,
        answer,
        hint: `前年を100%としたとき、今年は${up ? 100 + p : 100 - p}%にあたります。`,
        explanation: [
          `前年を100%とすると、今年は ${up ? `100 + ${p}` : `100 − ${p}`} = ${up ? 100 + p : 100 - p}%。`,
          `${p}%にあたる${up ? '増加' : '減少'}分を求める。5%にあたる量 = ${num(X)} ÷ 20 = ${num(X / 20)}、${p}%は5%の ${p / 5} 倍なので ${num(X / 20)} × ${p / 5} = ${num(change)}${cx.unit}`,
          `今年 = ${num(X)} ${up ? '+' : '−'} ${num(change)} = ${num(Y)}${cx.unit}`,
          `答え: ${fmt(Y)}`,
        ],
      }
    }

    if (v < 0.65) {
      // 前年の値を逆算
      const p = rng.pick([10, 20, 25, 30, 40, 50])
      const X = rng.pick(BASES)
      const rate = up ? 100 + p : 100 - p
      const Y = (X * rate) / 100
      const [rn, rd] = reduce(rate, 100)
      const { choices, answer } = mixedChoices(
        rng,
        X,
        [
          up ? (Y * (100 - p)) / 100 : (Y * (100 + p)) / 100, // 今年の値に増減率をかけてしまった
          up ? Y - p : Y + p,
          (Y * p) / 100,
          up ? Y - (Y * p) / 100 : Y + (Y * p) / 100,
        ].map(R),
        { format: fmt, padStep: Math.max(1, Math.round(X * 0.05)), isValid: posInt },
      )
      return {
        stem: `${cx.thing}は今年が${fmt(Y)}で、前年比${p}%${word}であった。前年の${cx.thing}は何${cx.unit}か。`,
        choices,
        answer,
        hint: `前年を100%としたとき、今年は${rate}%です。「前年 × ${rate}% = 今年」という式を逆にたどります。`,
        explanation: [
          `前年を100%とすると、今年は ${rate}%。つまり 前年 × ${decStr(rate / 100)} = ${num(Y)}`,
          `${rate}% = ${rawFrac(rn, rd)} なので、前年 = ${num(Y)} ÷ ${rn} × ${rd}（わる数の分母と分子を入れかえてかける）`,
          `${num(Y)} ÷ ${rn} = ${num(Y / rn)}、${num(Y / rn)} × ${rd} = ${num(X)}`,
          `答え: ${fmt(X)}`,
        ],
      }
    }

    // 増減率を求める
    const p = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75])
    const X = rng.pick(BASES)
    const change = (X * p) / 100
    const Y = up ? X + change : X - change
    const recip = (Y / X) * 100
    const { choices, answer } = mixedChoices(
      rng,
      p,
      [
        recip, // 今年が前年の何%かを答えた
        (change / Y) * 100, // 今年を基準にして割った
        p / 10,
        up ? p + 100 : 100 - p,
        p * 2,
      ].map(R),
      { format: pctStr, padStep: p >= 20 ? 5 : 1, isValid: (x) => okPct(x) && (up || x < 100) },
    )
    return {
      stem: `${cx.thing}は前年が${fmt(X)}、今年が${fmt(Y)}であった。今年は前年に対して何%${up ? '増加' : '減少'}したか。`,
      choices,
      answer,
      hint: `${up ? '増えた' : '減った'}量を、もとにする量（前年）で割ります。今年で割らないように気をつけましょう。`,
      explanation: [
        `${up ? '増加率' : '減少率'} = ${up ? '増えた' : '減った'}量 ÷ もとにする量（前年）× 100`,
        `${up ? '増えた' : '減った'}量 = ${up ? `${num(Y)} − ${num(X)}` : `${num(X)} − ${num(Y)}`} = ${num(change)}${cx.unit}`,
        ...toPercentSteps(change, X, p),
        `答え: ${pctStr(p)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 5. 連続する増減
// ---------------------------------------------------------------------------

const rateTwice = defineGenerator(
  { id: 'nv-ratio/rate-twice', topic: 'nv-ratio', difficulty: 2, label: '連続する値上げ・値下げ' },
  (rng) => {
    const kind = rng.pick(['ud', 'du', 'uu', 'dd'] as const)
    const upFirst = kind[0] === 'u'
    const upSecond = kind[1] === 'u'
    const { a, b, X } = retry(
      rng,
      (r) => ({ a: r.pick([10, 20, 25, 30, 40, 50]), b: r.pick([10, 20, 25, 30, 40, 50]), X: 100 * r.int(2, 20) }),
      ({ a, b, X }) => {
        const f1 = upFirst ? 100 + a : 100 - a
        const f2 = upSecond ? 100 + b : 100 - b
        const y1 = (X * f1) / 100
        const y2 = (y1 * f2) / 100
        return Number.isInteger(y1) && Number.isInteger(y2) && (f1 * f2) % 10 === 0 && y2 >= 100
      },
    )
    const f1 = upFirst ? 100 + a : 100 - a
    const f2 = upSecond ? 100 + b : 100 - b
    const y1 = (X * f1) / 100
    const y2 = (y1 * f2) / 100
    const w1 = upFirst ? '値上げ' : '値下げ'
    const w2 = upSecond ? '値上げ' : '値下げ'
    const lead = `ある商品の値段を、まず${a}%${w1}し、そのあと${b}%${w2}した。`

    if (rng.chance(0.55)) {
      const { choices, answer } = mixedChoices(
        rng,
        y2,
        [
          (X * (100 + (upFirst ? a : -a) + (upSecond ? b : -b))) / 100, // 割合をそのまま足し引きした
          y1, // 1回目の値段を答えた
          (X * f2) / 100, // 2回目の割合だけをかけた
          X,
        ].map(R),
        { format: yen, padStep: 10, isValid: posInt },
      )
      return {
        stem: `${lead}もとの値段が${yen(X)}のとき、いまの値段はいくらか。`,
        choices,
        answer,
        hint: '1回目の値段を出してから、その値段をもとにして2回目の割合をかけます。',
        explanation: [
          `${a}%${w1}すると、値段は もとの ${f1}% になる。${num(X)} × ${decStr(f1 / 100)} = ${yen(y1)}`,
          `次に${b}%${w2}すると、1回目の値段の ${f2}% になる。${num(y1)} × ${decStr(f2 / 100)} = ${yen(y2)}`,
          `答え: ${yen(y2)}`,
        ],
      }
    }

    const net = (f1 * f2) / 100
    const sa = upFirst ? a : -a
    const sb = upSecond ? b : -b
    const { choices, answer } = mixedChoices(
      rng,
      net,
      [100 + sa + sb, f1, f2, 100 - Math.abs(sa + sb), 100 + sa - sb].map(R),
      { format: pctStr, padStep: 5, isValid: okPct },
    )
    return {
      stem: `${lead}いまの値段は、もとの値段の何%か。`,
      choices,
      answer,
      hint: 'もとの値段を100とおいて、1回目、2回目と順にかけていきます。割合をそのまま足し引きしてはいけません。',
      explanation: [
        `もとの値段を100とする。${a}%${w1}すると ${f1}% になるので、100 × ${decStr(f1 / 100)} = ${decStr(f1)}`,
        `次に${b}%${w2}すると、${decStr(f1)} の ${f2}% になるので、${decStr(f1)} × ${decStr(f2 / 100)} = ${decStr(net)}`,
        `もとの値段100に対して${decStr(net)}なので、${pctStr(net)}。`,
        `答え: ${pctStr(net)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 6. 食塩水の濃度（基本）
// ---------------------------------------------------------------------------

const brineBasic = defineGenerator(
  { id: 'nv-ratio/brine-basic', topic: 'nv-ratio', difficulty: 2, label: '食塩水の濃度の基本' },
  (rng) => {
    const v = rng.next()
    const grams = withUnit('g')

    if (v < 0.25) {
      // 食塩の重さ
      const W = 100 * rng.int(1, 10)
      const x = rng.pick([3, 4, 5, 6, 8, 10, 12, 15, 20, 25])
      const s = (W * x) / 100
      const { choices, answer } = mixedChoices(
        rng,
        s,
        [(W * (100 - x)) / 100, (W * x) / 10, (W * x) / 1000, W / x, s * 2].map(R),
        { format: grams, padStep: Math.max(1, Math.round(s * 0.1)), isValid: posInt },
      )
      return {
        stem: `濃度${x}%の食塩水${num(W)}gには、食塩が何g含まれているか。`,
        choices,
        answer,
        hint: '食塩の重さ = 食塩水の重さ × 濃度 です。濃度は小数や分数に直して使います。',
        explanation: [
          '食塩の重さ = 食塩水の重さ × 濃度',
          `1%にあたる重さ = ${num(W)} ÷ 100 = ${decStr(W / 100)}g`,
          `${x}%は1%の ${x} 倍なので、${decStr(W / 100)} × ${x} = ${num(s)}g`,
          `答え: ${grams(s)}`,
        ],
      }
    }

    if (v < 0.5) {
      // 濃度を求める
      const { T, c } = retry(
        rng,
        (r) => ({ T: r.pick([100, 200, 250, 300, 400, 500]), c: r.int(2, 30) }),
        ({ T, c }) => Number.isInteger((T * c) / 100),
      )
      const s = (T * c) / 100
      const w = T - s
      const { choices, answer } = mixedChoices(
        rng,
        c,
        [round((s / w) * 100, 1), 100 - c, c / 10, c * 10, c * 2].map(R),
        { format: pctStr, padStep: c >= 20 ? 5 : 1, isValid: okUnder100 },
      )
      return {
        stem: `食塩${num(s)}gを水${num(w)}gに溶かして、食塩水を作った。この食塩水の濃度は何%か。`,
        choices,
        answer,
        hint: '濃度の分母は「食塩水全体」です。食塩の重さも足すのを忘れないようにしましょう。',
        explanation: [
          '濃度 = 食塩の重さ ÷ 食塩水全体の重さ × 100。食塩水全体 = 食塩 + 水。',
          `食塩水全体 = ${num(s)} + ${num(w)} = ${num(T)}g`,
          ...toPercentSteps(s, T, c),
          `答え: ${pctStr(c)}`,
        ],
      }
    }

    if (v < 0.75) {
      // 水を加えたときの濃度
      const { W, x, V } = retry(
        rng,
        (r) => ({ W: r.step(100, 600, 50), x: r.int(4, 25), V: r.step(50, 600, 50) }),
        ({ W, x, V }) => {
          const s = (W * x) / 100
          if (!Number.isInteger(s)) return false
          const c2 = (s * 100) / (W + V)
          return Number.isInteger(c2) && c2 >= 2 && c2 < x
        },
      )
      const s = (W * x) / 100
      const T = W + V
      const c2 = (s * 100) / T
      const { choices, answer } = mixedChoices(
        rng,
        c2,
        [(s * 100) / V, x - c2, x / 2, (x * V) / T, x - V / 10].map(R),
        { format: pctStr, padStep: c2 >= 10 ? 2 : 1, isValid: okUnder100 },
      )
      return {
        stem: `濃度${x}%の食塩水${num(W)}gに、水${num(V)}gを加えた。できた食塩水の濃度は何%か。`,
        choices,
        answer,
        hint: '水を加えても、食塩の重さは変わりません。食塩の重さを先に求め、新しい全体の重さで割ります。',
        explanation: [
          '水を加えても、食塩の重さは変わらない。まず食塩の重さを求める。',
          `食塩 = ${num(W)} × ${decStr(x / 100)} = ${num(s)}g`,
          `水を加えたあとの全体 = ${num(W)} + ${num(V)} = ${num(T)}g`,
          ...toPercentSteps(s, T, c2),
          `答え: ${pctStr(c2)}`,
        ],
      }
    }

    // 水を加える／蒸発させて目的の濃度にする
    const add = rng.chance(0.5)
    const { s, x, y } = retry(
      rng,
      (r) => ({ s: r.step(10, 60, 5), x: r.pick([4, 5, 8, 10, 12, 15, 20, 25]), y: r.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]) }),
      ({ s, x, y }) => {
        if (add ? y >= x : y <= x) return false
        const W = (s * 100) / x
        const T2 = (s * 100) / y
        if (!Number.isInteger(W) || !Number.isInteger(T2)) return false
        const V = add ? T2 - W : W - T2
        return W >= 100 && W <= 1000 && T2 >= 100 && T2 <= 1000 && V >= 20 && V % 10 === 0
      },
    )
    const W = (s * 100) / x
    const T2 = (s * 100) / y
    const V = add ? T2 - W : W - T2
    const [rn, rd] = reduce(y, 100)
    const { choices, answer } = mixedChoices(
      rng,
      V,
      [
        T2, // 最終的な食塩水の重さを答えた
        add ? (W * y) / x : (W * x) / y,
        add ? (W * (x - y)) / x : (W * (y - x)) / x,
        Math.abs(W - T2) + 50,
        V * 2,
      ].map(R),
      { format: grams, padStep: 10, isValid: posInt },
    )
    return {
      stem: add
        ? `濃度${x}%の食塩水${num(W)}gに水を加えて、濃度${y}%の食塩水にしたい。水を何g加えればよいか。`
        : `濃度${x}%の食塩水${num(W)}gから水を蒸発させて、濃度${y}%の食塩水にしたい。水を何g蒸発させればよいか。`,
      choices,
      answer,
      hint: `${add ? '水を加え' : '水を蒸発させ'}ても食塩の重さは変わりません。食塩の重さをもとに、できあがりの全体の重さを求めます。`,
      explanation: [
        `${add ? '水を加え' : '水を蒸発させ'}ても、食塩の重さは変わらない。食塩 = ${num(W)} × ${decStr(x / 100)} = ${num(s)}g`,
        `できあがりの食塩水を□gとすると、□ × ${decStr(y / 100)} = ${num(s)}。${y}% = ${rawFrac(rn, rd)} なので、□ = ${num(s)} ÷ ${rn} × ${rd} = ${num(T2)}g`,
        add
          ? `加える水 = できあがり − もとの重さ = ${num(T2)} − ${num(W)} = ${num(V)}g`
          : `蒸発させる水 = もとの重さ − できあがり = ${num(W)} − ${num(T2)} = ${num(V)}g`,
        `答え: ${grams(V)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 7. 食塩水を混ぜる
// ---------------------------------------------------------------------------

const brineMix = defineGenerator(
  { id: 'nv-ratio/brine-mix', topic: 'nv-ratio', difficulty: 3, label: '食塩水を混ぜる（濃度の計算・混ぜる量の逆算）' },
  (rng) => {
    const grams = withUnit('g')

    if (rng.chance(0.5)) {
      // 混ぜたあとの濃度
      const { x, y, a, b } = retry(
        rng,
        (r) => ({ x: r.int(3, 20), y: r.int(3, 20), a: r.int(1, 4), b: r.int(1, 4) }),
        ({ x, y, a, b }) => x !== y && a !== b && (10 * (a * x + b * y)) % (a + b) === 0,
      )
      const A = 100 * a
      const B = 100 * b
      const sA = a * x
      const sB = b * y
      const S = sA + sB
      const W = A + B
      const conc = S / (a + b)
      const { choices, answer } = mixedChoices(
        rng,
        conc,
        [(x + y) / 2, (b * x + a * y) / (a + b), x + y, Math.abs(x - y), Math.max(x, y)].map(R),
        { format: pctStr, padStep: 1, isValid: okUnder100 },
      )
      return {
        stem: `濃度${x}%の食塩水${num(A)}gと、濃度${y}%の食塩水${num(B)}gを混ぜた。できた食塩水の濃度は何%か。`,
        choices,
        answer,
        hint: '濃度の平均ではなく、食塩の重さの合計を、食塩水の重さの合計で割ります。',
        explanation: [
          '食塩の重さ = 食塩水の重さ × 濃度。混ぜると、食塩の重さも食塩水の重さも合計になる。',
          `${num(A)}gの${x}% → ${num(A)} × ${decStr(x / 100)} = ${num(sA)}g`,
          `${num(B)}gの${y}% → ${num(B)} × ${decStr(y / 100)} = ${num(sB)}g`,
          `食塩の合計 = ${num(sA)} + ${num(sB)} = ${num(S)}g、食塩水の合計 = ${num(A)} + ${num(B)} = ${num(W)}g`,
          `濃度 = ${num(S)} ÷ ${num(W)} × 100 = ${num(S * 100)} ÷ ${num(W)} = ${pctStr(conc)}`,
          `答え: ${pctStr(conc)}`,
        ],
      }
    }

    // 混ぜる量の逆算
    const { x, p, q, u } = retry(
      rng,
      (r) => ({ x: r.int(2, 14), p: r.int(1, 6), q: r.int(1, 6), u: r.pick([50, 100]) }),
      ({ p, q }) => p !== q,
    )
    const z = x + q
    const y = z + p
    const A = p * u
    const B = q * u
    const { choices, answer } = mixedChoices(
      rng,
      B,
      [
        (A * p) / q, // 濃度の差の比を逆にした
        A, // 同じ量と考えた
        (A * q) / (p + q),
        (A * (z - x)) / (y - x) + u,
        A + B,
      ].map(R),
      { format: grams, padStep: u, isValid: posInt },
    )
    return {
      stem: `濃度${x}%の食塩水${num(A)}gに、濃度${y}%の食塩水を混ぜて、濃度${z}%の食塩水を作りたい。濃度${y}%の食塩水を何g混ぜればよいか。`,
      choices,
      answer,
      hint: `混ぜる前後で、食塩の重さの合計は変わりません。${z}%を基準に、足りない分と余る分が等しいと考えましょう。`,
      explanation: [
        `混ぜる${y}%の食塩水を□gとする。混ぜたあとは (${num(A)} + □)g で、濃度は${z}%。`,
        `${z}%を基準に考える。${x}%の食塩水は ${z} − ${x} = ${q}% 足りず、${y}%の食塩水は ${y} − ${z} = ${p}% 多い。`,
        `足りない食塩の量と、多い食塩の量が等しいので、${num(A)} × ${q} = □ × ${p}`,
        `□ = ${num(A)} × ${q} ÷ ${p} = ${num(A * q)} ÷ ${p} = ${num(B)}g`,
        `答え: ${grams(B)}`,
      ],
    }
  },
)

const generators: Generator[] = [
  withTarget(split, 50),
  withTarget(partWhole, 50),
  withTarget(ratioOfRatio, 70),
  withTarget(rateChange, 70),
  withTarget(rateTwice, 70),
  withTarget(brineBasic, 75),
  withTarget(brineMix, 100),
]
export default generators
