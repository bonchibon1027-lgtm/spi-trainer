import type { Generator, Table } from '../types'
import type { Rng } from '../lib/rng'
import { defineGenerator, retry } from './common'
import { num } from '../lib/math'
import { R, decStr, mixedChoices, pctStr, posInt } from './numeric-util'

// 表の読み取り（nv-table）
// どの型も「表の数字 → 何を何で割るか」を答えから逆算して決める。電卓なしで割り切れる数字だけを使う。
// 各型は「数字を決める draw」と「問題を作る build」に分けて export する（テストで答えを別に計算し直すため）。

const LETTERS = ['A', 'B', 'C', 'D']

/** 10〜45 の 5 の倍数を4つ、合計 100 になるように選ぶ（どれも違う値） */
function drawPercents(rng: Rng): number[] {
  return retry(
    rng,
    (r) => {
      const p = [r.step(10, 45, 5), r.step(10, 45, 5), r.step(10, 45, 5)]
      return [...p, 100 - p[0] - p[1] - p[2]]
    },
    (p) => p[3] >= 10 && p[3] <= 45 && new Set(p).size === 4,
  )
}

const isPct = (n: number) => n > 0 && n < 100 && Number.isInteger(n)

// ---------------------------------------------------------------------------
// 1. 構成比（合計に占める割合）
// ---------------------------------------------------------------------------

const SHARE_CONTEXTS = [
  { title: 'ある店の商品別の月間売上', head: '商品', col: '売上（万円）', item: '商品', measure: '売上', unit: '万円' },
  { title: 'ある会社の支店別の契約件数', head: '支店', col: '契約件数（件）', item: '支店', measure: '契約件数', unit: '件' },
  { title: 'ある市の地区別の世帯数', head: '地区', col: '世帯数（世帯）', item: '地区', measure: '世帯数', unit: '世帯' },
]

export type ShareParams = { ctx: number; total: number; percents: number[]; ask: number }

export function drawShare(rng: Rng): ShareParams {
  return {
    ctx: rng.int(0, SHARE_CONTEXTS.length - 1),
    total: rng.pick([200, 300, 400, 500, 600, 800]),
    percents: drawPercents(rng),
    ask: rng.int(0, 3),
  }
}

export function shareValues(p: ShareParams): number[] {
  return p.percents.map((x) => (p.total * x) / 100)
}

const share = defineGenerator(
  { id: 'nv-table/share', topic: 'nv-table', difficulty: 1, label: '合計に占める割合（構成比）' },
  (rng) => {
    const p = drawShare(rng)
    const c = SHARE_CONTEXTS[p.ctx]
    const values = shareValues(p)
    const v = values[p.ask]
    const ans = p.percents[p.ask]
    const other = values[(p.ask + 1) % 4]
    const table: Table = {
      caption: c.title,
      headers: [c.head, c.col],
      rows: [...LETTERS.map((l, i) => [`${c.item}${l}`, num(values[i])]), ['合計', num(p.total)]],
    }
    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        Math.round((v / other) * 100), // 合計ではなく、別の行で割った
        100 - ans, // 残りの割合を答えた
        p.percents[(p.ask + 2) % 4], // 別の行の割合
        ans + 5,
      ],
      { format: pctStr, padStep: 5, isValid: isPct },
    )
    const name = `${c.item}${LETTERS[p.ask]}`
    return {
      table,
      stem: `次の表は、${c.title}を表したものである。${name}の${c.measure}は、合計の何%か。`,
      choices,
      answer,
      hint: '「合計の何%」なので、合計で割ります。',
      explanation: [
        '割合（%）= 部分 ÷ 全体 × 100。ここでは全体 = 合計。',
        `${name}は${num(v)}${c.unit}、合計は${num(p.total)}${c.unit}。`,
        `${num(v)} ÷ ${num(p.total)} = ${decStr(v / p.total)}`,
        `${decStr(v / p.total)} × 100 = ${pctStr(ans)}`,
        `答え: ${pctStr(ans)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 2. 前年からの増加率
// ---------------------------------------------------------------------------

const GROWTH_CONTEXTS = [
  { title: '3つの施設の年間来場者数', head: '施設', item: '施設', measure: '来場者数', unit: '人' },
  { title: '3つの店舗の年間販売数', head: '店舗', item: '店舗', measure: '販売数', unit: '個' },
  { title: '3つの地域の新規会員数', head: '地域', item: '地域', measure: '新規会員数', unit: '人' },
]

export type GrowthParams = { ctx: number; base: number; rate: number; ask: number; others: [number, number][] }

export function drawGrowth(rng: Rng): GrowthParams {
  const { base, rate } = retry(
    rng,
    (r) => ({ base: r.pick([200, 240, 300, 400, 500, 600, 800, 1000, 1200]), rate: r.pick([5, 10, 15, 20, 25, 30, 40, 50]) }),
    ({ base, rate }) => posInt((base * rate) / 100),
  )
  const others: [number, number][] = [0, 1].map(() => {
    const a = rng.step(200, 1200, 10)
    return [a, a + rng.step(-100, 300, 10)] as [number, number]
  })
  return { ctx: rng.int(0, GROWTH_CONTEXTS.length - 1), base, rate, ask: rng.int(0, 2), others }
}

const growth = defineGenerator(
  { id: 'nv-table/growth', topic: 'nv-table', difficulty: 2, label: '前年からの増加率' },
  (rng) => {
    const p = drawGrowth(rng)
    const c = GROWTH_CONTEXTS[p.ctx]
    const inc = (p.base * p.rate) / 100
    const next = p.base + inc
    const pairs: [number, number][] = [...p.others]
    pairs.splice(p.ask, 0, [p.base, next])
    const table: Table = {
      caption: `${c.title}（単位: ${c.unit}）`,
      headers: [c.head, '2023年', '2024年'],
      rows: pairs.map(([a, b], i) => [`${c.item}${LETTERS[i]}`, num(a), num(b)]),
    }
    const name = `${c.item}${LETTERS[p.ask]}`
    const { choices, answer } = mixedChoices(
      rng,
      p.rate,
      [
        Math.round((inc / next) * 100), // 2024年の値で割った
        Math.round((next / p.base) * 100), // 「何%になったか」を答えた
        p.rate + 5,
        p.rate * 2,
      ],
      { format: pctStr, padStep: 5, isValid: (n) => n > 0 && Number.isInteger(n) },
    )
    return {
      table,
      stem: `次の表は、${c.title}を表したものである。${name}の2024年の${c.measure}は、2023年に比べて何%増加したか（必要なときは、小数第1位を四捨五入すること）。`,
      choices,
      answer,
      hint: '増えた分を、もとの年（2023年）の値で割ります。',
      explanation: [
        '増加率（%）= 増えた分 ÷ もとの年の値 × 100。もとの年は2023年。',
        `増えた分 = ${num(next)} − ${num(p.base)} = ${num(inc)}${c.unit}`,
        `${num(inc)} ÷ ${num(p.base)} = ${decStr(inc / p.base)}`,
        `${decStr(inc / p.base)} × 100 = ${pctStr(p.rate)}`,
        `答え: ${pctStr(p.rate)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 3. 何倍か
// ---------------------------------------------------------------------------

const TIMES_CONTEXTS = [
  { title: '4つの店舗のある日の販売数', head: '店舗', col: '販売数（個）', item: '店舗', measure: '販売数', unit: '個' },
  { title: '4つの部の月間の残業時間', head: '部', col: '残業時間（時間）', item: '部', measure: '残業時間', unit: '時間' },
]
const RATIOS = [1.2, 1.25, 1.5, 1.6, 2, 2.5, 3, 4]

export type TimesParams = { ctx: number; base: number; k: number; a: number; b: number; fill: number[] }

export function drawTimes(rng: Rng): TimesParams {
  const { base, k } = retry(
    rng,
    (r) => ({ base: r.step(40, 300, 20), k: r.pick(RATIOS) }),
    ({ base, k }) => posInt(R(base * k)) && base * k <= 1000,
  )
  const [a, b] = rng.shuffle([0, 1, 2, 3]).slice(0, 2)
  const fill = [0, 1, 2, 3].map(() => rng.step(40, 600, 10))
  return { ctx: rng.int(0, TIMES_CONTEXTS.length - 1), base, k, a, b, fill }
}

export function timesValues(p: TimesParams): number[] {
  const v = [...p.fill]
  v[p.a] = R(p.base * p.k) // 比べる量
  v[p.b] = p.base // もとにする量
  return v
}

const times = defineGenerator(
  { id: 'nv-table/times', topic: 'nv-table', difficulty: 1, label: '何倍か' },
  (rng) => {
    const p = drawTimes(rng)
    const c = TIMES_CONTEXTS[p.ctx]
    const v = timesValues(p)
    const x = v[p.a]
    const y = v[p.b]
    const nameA = `${c.item}${LETTERS[p.a]}`
    const nameB = `${c.item}${LETTERS[p.b]}`
    const fmt = (n: number) => `${R(n)}倍`
    const { choices, answer } = mixedChoices(
      rng,
      p.k,
      [
        R(p.k - 1), // 差を、もとにする量で割った
        R(Math.round((y / x) * 100) / 100), // 逆に割った
        R(p.k + 0.5),
        R(p.k * 2),
      ],
      { format: fmt, padStep: 0.25, isValid: (n) => n > 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 },
    )
    return {
      table: {
        caption: c.title,
        headers: [c.head, c.col],
        rows: LETTERS.map((l, i) => [`${c.item}${l}`, num(v[i])]),
      },
      stem: `次の表は、${c.title}を表したものである。${nameA}の${c.measure}は、${nameB}の${c.measure}の何倍か。`,
      choices,
      answer,
      hint: '「Bの何倍」なら、Bでわります（Bがもとにする量）。',
      explanation: [
        `何倍 = 比べる量 ÷ もとにする量。「${nameB}の何倍」なので、もとにする量は${nameB}。`,
        `${nameA}は${num(x)}${c.unit}、${nameB}は${num(y)}${c.unit}。`,
        `${num(x)} ÷ ${num(y)} = ${R(p.k)}`,
        `答え: ${fmt(p.k)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 4. 構成比と1つの実数から、別の実数を求める
// ---------------------------------------------------------------------------

const COMP_CONTEXTS = [
  { title: 'ある会社の部署別の社員数の構成比', head: '部署', names: ['営業部', '企画部', '総務部', '開発部'], unit: '人', measure: '社員' },
  { title: 'ある学校の部活動別の部員数の構成比', head: '部活動', names: ['野球部', '吹奏楽部', '美術部', 'テニス部'], unit: '人', measure: '部員' },
  { title: 'あるアンケートで最もよく使う交通手段の回答の構成比', head: '交通手段', names: ['電車', 'バス', '自転車', '徒歩'], unit: '人', measure: '回答者' },
]

export type CompParams = { ctx: number; total: number; percents: number[]; known: number; ask: number }

export function drawComp(rng: Rng): CompParams {
  const [known, ask] = rng.shuffle([0, 1, 2, 3]).slice(0, 2)
  return {
    ctx: rng.int(0, COMP_CONTEXTS.length - 1),
    total: rng.pick([120, 160, 200, 240, 280, 320, 360, 400]),
    percents: drawPercents(rng),
    known,
    ask,
  }
}

const comp = defineGenerator(
  { id: 'nv-table/composition', topic: 'nv-table', difficulty: 2, label: '構成比と人数から別の人数を求める' },
  (rng) => {
    const p = drawComp(rng)
    const c = COMP_CONTEXTS[p.ctx]
    const pk = p.percents[p.known]
    const pa = p.percents[p.ask]
    const kc = (p.total * pk) / 100
    const ans = (p.total * pa) / 100
    const nk = c.names[p.known]
    const na = c.names[p.ask]
    const fmt = (n: number) => `${num(n)}${c.unit}`
    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        p.total, // 全体を答えた
        Math.round((kc * pa) / 100), // 実数にそのまま割合をかけた
        kc + (pa - pk), // 構成比の差をそのまま足した
        pa, // 構成比の数字をそのまま答えた
      ],
      { format: fmt, padStep: Math.max(2, Math.round(ans / 10)), isValid: (n) => posInt(n) && n !== kc },
    )
    return {
      table: {
        caption: `${c.title}（単位: %）`,
        headers: [c.head, '構成比（%）'],
        rows: [...c.names.map((n, i) => [n, String(p.percents[i])]), ['合計', '100']],
      },
      stem: `次の表は、${c.title}を表したものである。${nk}の${c.measure}は${fmt(kc)}である。${na}の${c.measure}は何人か。`,
      choices,
      answer,
      hint: '分かっている人数と構成比から、まず全体の人数を求めます。',
      explanation: [
        `${nk}は全体の${pk}%で、${fmt(kc)}。`,
        `全体 = ${num(kc)} ÷ ${decStr(pk / 100)} = ${fmt(p.total)}`,
        `${na}は全体の${pa}%なので、${num(p.total)} × ${decStr(pa / 100)} = ${fmt(ans)}`,
        `答え: ${fmt(ans)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 5. 2年分の総数と構成比から、人数の増減を求める
// ---------------------------------------------------------------------------

const TWO_YEAR_CONTEXTS = [
  { title: 'ある大学の学生数と、そのうち留学経験のある学生の割合', group: '留学経験のある学生', unit: '人' },
  { title: 'ある会社の社員数と、そのうちテレワークをしている社員の割合', group: 'テレワークをしている社員', unit: '人' },
  { title: 'ある町の世帯数と、そのうち車を持っている世帯の割合', group: '車を持っている世帯', unit: '世帯' },
]

export type TwoYearParams = { ctx: number; t1: number; t2: number; a1: number; a2: number }

export function drawTwoYear(rng: Rng): TwoYearParams {
  return retry(
    rng,
    (r) => ({
      ctx: r.int(0, TWO_YEAR_CONTEXTS.length - 1),
      t1: r.step(400, 1200, 100),
      t2: r.step(400, 1200, 100),
      a1: r.step(10, 60, 5),
      a2: r.step(10, 60, 5),
    }),
    // 人数が増えていて、総数・割合の両方が変わっているもの。1年での変化は現実的な大きさにする
    ({ t1, t2, a1, a2 }) =>
      t1 !== t2 &&
      a1 !== a2 &&
      Math.abs(t2 - t1) <= 300 &&
      Math.abs(a2 - a1) <= 15 &&
      (t2 * a2) / 100 - (t1 * a1) / 100 > 0,
  )
}

const twoYear = defineGenerator(
  { id: 'nv-table/two-year', topic: 'nv-table', difficulty: 3, label: '2年分の総数と割合から増えた人数を求める' },
  (rng) => {
    const p = drawTwoYear(rng)
    const c = TWO_YEAR_CONTEXTS[p.ctx]
    const g1 = (p.t1 * p.a1) / 100
    const g2 = (p.t2 * p.a2) / 100
    const ans = g2 - g1
    const fmt = (n: number) => `${num(n)}${c.unit}`
    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        Math.round((p.t1 * Math.abs(p.a2 - p.a1)) / 100), // 割合の差を、1年目の総数にかけた
        Math.round((Math.abs(p.t2 - p.t1) * p.a2) / 100), // 総数の差に割合をかけた
        g2, // 2年目の人数を答えた
        Math.abs(p.a2 - p.a1), // 割合の差をそのまま答えた
      ],
      { format: fmt, padStep: 10, isValid: (n) => posInt(n) },
    )
    return {
      table: {
        caption: c.title,
        headers: ['', '2023年', '2024年'],
        rows: [
          [`総数（${c.unit}）`, num(p.t1), num(p.t2)],
          [`${c.group}の割合（%）`, String(p.a1), String(p.a2)],
        ],
      },
      stem: `次の表は、${c.title}を表したものである。${c.group}は、2023年から2024年にかけて何${c.unit}増えたか。`,
      choices,
      answer,
      hint: '割合どうしを引くのではなく、年ごとに人数を出してから引きます。',
      targetSec: 120,
      explanation: [
        '総数がちがうので、割合の差では比べられない。年ごとに「総数 × 割合」で人数を出す。',
        `2023年: ${num(p.t1)} × ${decStr(p.a1 / 100)} = ${fmt(g1)}`,
        `2024年: ${num(p.t2)} × ${decStr(p.a2 / 100)} = ${fmt(g2)}`,
        `増えた数 = ${num(g2)} − ${num(g1)} = ${fmt(ans)}`,
        `答え: ${fmt(ans)}`,
      ],
    }
  },
)

const generators: Generator[] = [share, times, growth, comp, twoYear]
export default generators
