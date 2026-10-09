import type { Generator, Table } from '../types'
import { defineGenerator, retry, type GeneratedBody } from './common'
import { balancedNumericChoices } from './balanced-choices'
import type { Rng } from '../lib/rng'

// 集合（アンケート・表・3つの集合・最少最大）
//
// 各「型」は、乱数で数字を決める部分（draw）と、問題文・選択肢・解説を作る部分（build）に分けてある。
// 数字は「答えから逆算」して決める（各領域の人数を先に決め、問題に書く数をそこから計算する）。
// 独自テスト（sets.test.ts）が draw の結果から人を1人ずつ作って数え直し、正解と照らし合わせる。

type Meta = Parameters<typeof defineGenerator>[0]

export type Spec<P> = {
  generator: Generator
  draw: (rng: Rng) => P
  build: (p: P, rng: Rng) => GeneratedBody
}

function spec<P>(meta: Meta, draw: (rng: Rng) => P, build: (p: P, rng: Rng) => GeneratedBody): Spec<P> {
  return { generator: defineGenerator(meta, (rng) => build(draw(rng), rng)), draw, build }
}

const nin = (n: number) => `${n}人`

/** 人数の選択肢。全体の人数 total を超える値や、0以下の値は選択肢に入れない（現実的な人数だけにする） */
function peopleChoices(rng: Rng, correct: number, wrong: number[], total: number) {
  return balancedNumericChoices(rng, correct, wrong, {
    format: nin,
    isValid: (n) => Number.isInteger(n) && n > 0 && n <= total,
  })
}

const SURVEYS = [
  { who: 'ある会社の社員', qa: 'テレワークを経験したことがある', qb: '副業に関心がある' },
  { who: 'ある大学の学生', qa: '朝食を毎日食べる', qb: '自炊をしている' },
  { who: 'ある店の来店客', qa: 'ポイントカードを持っている', qb: 'アプリを使っている' },
  { who: 'ある町の住民', qa: '電車をよく利用する', qb: '自転車をよく利用する' },
  { who: 'あるクラスの生徒', qa: '読書が好き', qb: 'スポーツが好き' },
]

// ---------------------------------------------------------------------------
// 2つの質問のアンケート（共通の数字の決め方）

export type TwoP = { N: number; onlyA: number; onlyB: number; both: number; neither: number; sv: number }

function drawTwo(rng: Rng): TwoP {
  const N = rng.step(30, 100, 10)
  const m = Math.floor(N / 5)
  const both = rng.int(3, m)
  const neither = rng.int(3, m)
  const rest = N - both - neither
  const onlyA = rng.int(Math.ceil(rest * 0.3), Math.floor(rest * 0.7))
  const onlyB = rest - onlyA
  return { N, onlyA, onlyB, both, neither, sv: rng.int(0, SURVEYS.length - 1) }
}

function twoStemHead(p: TwoP) {
  const s = SURVEYS[p.sv]
  const a = p.onlyA + p.both
  const b = p.onlyB + p.both
  return {
    a,
    b,
    head: `${s.who}${p.N}人に、2つの質問をした。質問A「${s.qa}」に「はい」と答えた人は${a}人、質問B「${s.qb}」に「はい」と答えた人は${b}人`,
  }
}

const VENN_IDEA = '「全体 = Aだけ + Bだけ + 両方 + どちらでもない」という関係で整理する。（Aだけ = Aに「はい」で、Bは「いいえ」の人）'

// ---------------------------------------------------------------------------
// 1. どちらも「いいえ」の人数 difficulty 1

const twoNeither = spec<TwoP>(
  { id: 'nv-sets/two-neither', topic: 'nv-sets', difficulty: 1, label: '2つの質問（どちらもいいえ）' },
  drawTwo,
  (p, rng) => {
    const { N, onlyA, onlyB, both, neither } = p
    const { a, b, head } = twoStemHead(p)
    const { choices, answer } = peopleChoices(rng, neither, [
      N - a - b, // 両方を足し戻し忘れた
      N - a - b + 2 * both, // 両方を引く向きを間違えた
      a + b - both, // 少なくとも一方に「はい」の人数
      N - both,
      a + b - 2 * both,
    ], N)
    return {
      stem: `${head}、両方に「はい」と答えた人は${both}人であった。どちらにも「いいえ」と答えた人は何人か。`,
      choices,
      answer,
      targetSec: 60,
      hint: 'Aだけ、Bだけ、両方、どちらでもない、の4つに分けて、全体から引いていきます。',
      explanation: [
        VENN_IDEA,
        `Aだけ = A全体 − 両方 = ${a} − ${both} = ${onlyA}（Aに「はい」の${a}人には、両方の${both}人も含まれている）`,
        `Bだけ = B全体 − 両方 = ${b} − ${both} = ${onlyB}`,
        `どちらでもない = 全体 − Aだけ − Bだけ − 両方 = ${N} − ${onlyA} − ${onlyB} − ${both} = ${neither}`,
        `答え: ${nin(neither)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 2. Aだけ・Bだけ・どちらか一方だけ difficulty 1

export type TwoOnlyP = TwoP & { ask: 'onlyA' | 'onlyB' | 'exactlyOne' }

const twoOnly = spec<TwoOnlyP>(
  { id: 'nv-sets/two-only', topic: 'nv-sets', difficulty: 1, label: '2つの質問（片方だけ）' },
  (rng) => ({ ...drawTwo(rng), ask: rng.pick<TwoOnlyP['ask']>(['onlyA', 'onlyB', 'exactlyOne']) }),
  (p, rng) => {
    const { onlyA, onlyB, both, ask } = p
    const { a, b, head } = twoStemHead(p)
    const target = ask === 'onlyA' ? onlyA : ask === 'onlyB' ? onlyB : onlyA + onlyB
    const wrong =
      ask === 'onlyA'
        ? [a, onlyB, a + both, a - 2 * both]
        : ask === 'onlyB'
          ? [b, onlyA, b + both, b - 2 * both]
          : [a + b - both, a + b, onlyA, onlyB, a + b - 3 * both]
    const { choices, answer } = peopleChoices(rng, target, wrong, p.N)
    const question = {
      onlyA: '質問Aにだけ「はい」と答えた人は何人か。',
      onlyB: '質問Bにだけ「はい」と答えた人は何人か。',
      exactlyOne: 'どちらか一方の質問にだけ「はい」と答えた人は何人か。',
    }[ask]
    const explanation =
      ask === 'onlyA'
        ? [
            'Aに「はい」と答えた人 = Aだけ + 両方 という関係がある。',
            `Aだけ = A全体 − 両方 = ${a} − ${both} = ${onlyA}`,
            `答え: ${nin(onlyA)}`,
          ]
        : ask === 'onlyB'
          ? [
              'Bに「はい」と答えた人 = Bだけ + 両方 という関係がある。',
              `Bだけ = B全体 − 両方 = ${b} − ${both} = ${onlyB}`,
              `答え: ${nin(onlyB)}`,
            ]
          : [
              'Aに「はい」 = Aだけ + 両方、Bに「はい」 = Bだけ + 両方 という関係がある。',
              `Aだけ = ${a} − ${both} = ${onlyA}`,
              `Bだけ = ${b} − ${both} = ${onlyB}`,
              `どちらか一方だけ = Aだけ + Bだけ = ${onlyA} + ${onlyB} = ${onlyA + onlyB}（${a} + ${b} とすると、両方の${both}人を2回数えてしまう）`,
              `答え: ${nin(onlyA + onlyB)}`,
            ]
    return {
      stem: `${head}、両方に「はい」と答えた人は${both}人であった。${question}`,
      choices,
      answer,
      targetSec: 60,
      hint: '「Aに『はい』」や「Bに『はい』」の人数には、両方に「はい」の人も入っています。両方の人を引いてから考えます。',
      explanation,
    }
  },
)

// ---------------------------------------------------------------------------
// 3. 両方の人数を逆算 difficulty 2

const twoBoth = spec<TwoP>(
  { id: 'nv-sets/two-both', topic: 'nv-sets', difficulty: 2, label: '2つの質問（両方の人数を逆算）' },
  drawTwo,
  (p, rng) => {
    const { N, both, neither } = p
    const { a, b, head } = twoStemHead(p)
    const { choices, answer } = peopleChoices(rng, both, [
      a + b - N, // どちらもいいえの人数を考えなかった
      N - neither, // 少なくとも一方に「はい」の人数
      both + neither,
      a + b - neither,
      both - neither,
    ], N)
    return {
      stem: `${head}、どちらにも「いいえ」と答えた人は${neither}人であった。両方に「はい」と答えた人は何人か。`,
      choices,
      answer,
      targetSec: 75,
      hint: '両方の人数を□とおいて、「全体 = Aだけ + Bだけ + 両方 + どちらでもない」の式を作ります。',
      explanation: [
        VENN_IDEA,
        `両方に「はい」の人数を□人とおく。Aだけ = ${a} − □、Bだけ = ${b} − □ と表せる。`,
        `${N} = (${a} − □) + (${b} − □) + □ + ${neither}`,
        `右辺を整理する。□は −□ − □ + □ = −□ になるので、${N} = ${a} + ${b} + ${neither} − □ = ${a + b + neither} − □`,
        `□ = ${a + b + neither} − ${N} = ${both}`,
        `答え: ${nin(both)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 4. 表で示すアンケート結果 difficulty 2

const TABLE_SCENARIOS = [
  { who: '社員', topic: '在宅勤務の制度に賛成か', rows: ['男性', '女性'], cols: ['賛成', '反対'] },
  { who: '来店客', topic: '店のアプリを使っているか', rows: ['20代以下', '30代以上'], cols: ['使っている', '使っていない'] },
  { who: '学生', topic: '朝食を毎日食べるか', rows: ['1年生', '2年生'], cols: ['食べる', '食べない'] },
  { who: '会員', topic: '新しいサービスを知っているか', rows: ['入会3年未満', '入会3年以上'], cols: ['知っている', '知らない'] },
]

type Cell = [number, number] // [行, 列]。行・列とも 2 は「計」

// 「中身2つの和 = 計」の関係が成り立つ6本の線（行3本、列3本）。各線は [部分1, 部分2, 計]
const LINES: Cell[][] = [
  [[0, 0], [0, 1], [0, 2]],
  [[1, 0], [1, 1], [1, 2]],
  [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 1], [1, 1], [2, 1]],
  [[0, 2], [1, 2], [2, 2]],
]

const cellKey = ([r, c]: Cell) => `${r},${c}`

type TableStep = { cell: Cell; line: Cell[] }

/** 分かっているマスから、1つだけ分からない線を順にたどって、ターゲットのマスが求まるか調べる */
function solveTable(known: boolean[][], target: Cell): TableStep[] | null {
  const have = known.map((r) => r.slice())
  const steps: TableStep[] = []
  let progress = true
  while (!have[target[0]][target[1]] && progress) {
    progress = false
    for (const line of LINES) {
      const unknown = line.filter(([r, c]) => !have[r][c])
      if (unknown.length === 1) {
        const [r, c] = unknown[0]
        have[r][c] = true
        steps.push({ cell: [r, c], line })
        progress = true
        if (have[target[0]][target[1]]) break
      }
    }
  }
  return have[target[0]][target[1]] ? steps : null
}

/** ターゲットを求めるのに本当に必要なステップだけに絞る */
function neededSteps(steps: TableStep[], target: Cell): TableStep[] {
  const stepOf = new Map(steps.map((s) => [cellKey(s.cell), s]))
  const need = new Set<string>()
  const visit = (cell: Cell) => {
    const k = cellKey(cell)
    const st = stepOf.get(k)
    if (need.has(k) || !st) return
    need.add(k)
    for (const c of st.line) if (cellKey(c) !== k) visit(c)
  }
  visit(target)
  return steps.filter((s) => need.has(cellKey(s.cell)))
}

export type TableP = { N: number; truth: number[][]; known: boolean[][]; target: Cell; sc: number }

const tableSet = spec<TableP>(
  { id: 'nv-sets/table', topic: 'nv-sets', difficulty: 2, label: '表で示すアンケート結果' },
  (rng) => {
    const N = rng.step(40, 100, 5)
    const hi = Math.floor(N * 0.4)
    const [c00, c01, c10, c11] = retry(
      rng,
      (r) => {
        const x = r.int(8, hi)
        const y = r.int(8, hi)
        const z = r.int(8, hi)
        return [x, y, z, N - x - y - z]
      },
      (c) => c[3] >= 8,
    )
    const truth = [
      [c00, c01, c00 + c01],
      [c10, c11, c10 + c11],
      [c00 + c10, c01 + c11, N],
    ]
    const others: Cell[] = []
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 2 && c === 2)) others.push([r, c])
    const { known, target } = retry(
      rng,
      (r) => {
        const target = r.pick(others)
        const pool = others.filter((c) => cellKey(c) !== cellKey(target))
        const shown = r.shuffle(pool).slice(0, r.pick([3, 4, 4]))
        const known = [0, 1, 2].map(() => [false, false, false])
        known[2][2] = true
        for (const [rr, cc] of shown) known[rr][cc] = true
        return { known, target, minSteps: r.chance(0.35) ? 1 : 2 }
      },
      // 求められること、かつ、たいてい2ステップ以上かかる配置にする
      ({ known, target, minSteps }) => {
        const steps = solveTable(known, target)
        return steps !== null && neededSteps(steps, target).length >= minSteps
      },
    )
    return { N, truth, known, target, sc: rng.int(0, TABLE_SCENARIOS.length - 1) }
  },
  ({ N, truth, known, target, sc }, rng) => {
    const s = TABLE_SCENARIOS[sc]
    const rowName = (r: number) => (r < 2 ? s.rows[r] : '計')
    const colName = (c: number) => (c < 2 ? s.cols[c] : '計')
    const base = ([r, c]: Cell) =>
      r < 2 && c < 2
        ? `${s.rows[r]}の「${s.cols[c]}」`
        : r < 2
          ? `${s.rows[r]}の計`
          : c < 2
            ? `「${s.cols[c]}」の計`
            : '全体'
    const name = (cell: Cell) => (cellKey(cell) === cellKey(target) ? `ア（${base(cell)}）` : base(cell))

    const table: Table = {
      caption: '（単位: 人）',
      headers: ['', colName(0), colName(1), colName(2)],
      rows: [0, 1, 2].map((r) => [
        rowName(r),
        ...[0, 1, 2].map((c) => {
          if (r === target[0] && c === target[1]) return 'ア'
          return known[r][c] ? String(truth[r][c]) : ''
        }),
      ]),
    }

    const steps = neededSteps(solveTable(known, target)!, target)
    const val = (c: Cell) => truth[c[0]][c[1]]
    const lines = steps.map(({ cell, line }) => {
      const [x, y, t] = line
      const u = cellKey(cell)
      if (u === cellKey(t)) return `${name(t)} = ${name(x)} + ${name(y)} = ${val(x)} + ${val(y)} = ${val(t)}`
      const [mine, other] = u === cellKey(x) ? [x, y] : [y, x]
      return `${name(mine)} = ${name(t)} − ${name(other)} = ${val(t)} − ${val(other)} = ${val(mine)}`
    })

    // よくある間違い: 最後の計算の足し引きを逆にした値、同じ行・列のほかのマスの値
    const last = steps[steps.length - 1]
    const [lx, ly, lt] = last.line
    const wrongOp =
      cellKey(last.cell) === cellKey(lt)
        ? Math.abs(val(lx) - val(ly))
        : val(lt) + val(cellKey(last.cell) === cellKey(lx) ? ly : lx)
    const near: number[] = []
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === target[0] || c === target[1]) if (!(r === target[0] && c === target[1])) near.push(truth[r][c])
      }
    }
    const answerVal = truth[target[0]][target[1]]
    const { choices, answer } = peopleChoices(rng, answerVal, [wrongOp, ...near], N)
    return {
      stem: `ある調査で、${s.who}${N}人に「${s.topic}」を尋ね、結果を次の表にまとめた。空欄は分かっていない数である。アに入る数を求めよ。`,
      table,
      choices,
      answer,
      targetSec: 75,
      hint: '表の行や列では「中身の2つの数の和 = 計」が成り立ちます。1つだけ分からない行や列を探して、順に求めます。',
      explanation: [
        '表の行や列には、「中身の2つの数を足すと計になる」という関係がある。分かっている数から、1つだけ分からない行や列を探して、順に求めていく。',
        ...lines,
        `答え: ${nin(answerVal)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 5. 3つの集合 difficulty 3

const THREE_SURVEYS = [
  { who: 'ある会社の社員', q: ['営業職に興味がある', '企画職に興味がある', '広報職に興味がある'] },
  { who: 'ある大学の学生', q: ['英語の授業をとっている', '中国語の授業をとっている', '韓国語の授業をとっている'] },
  { who: 'あるクラブの会員', q: ['テニスをする', 'ゴルフをする', 'スキーをする'] },
]

export type ThreeP = {
  mode: 'none' | 'union' | 'all'
  /** 各領域の人数。oA は「Aだけ」、AB は「AとBだけ（Cは×）」、ABC は3つすべて */
  region: { oA: number; oB: number; oC: number; AB: number; BC: number; CA: number; ABC: number; none: number }
  sv: number
}

const three = spec<ThreeP>(
  { id: 'nv-sets/three', topic: 'nv-sets', difficulty: 3, label: '3つの集合' },
  (rng) => ({
    mode: rng.pick<ThreeP['mode']>(['none', 'union', 'all']),
    region: {
      oA: rng.int(3, 10),
      oB: rng.int(3, 10),
      oC: rng.int(3, 10),
      AB: rng.int(2, 6),
      BC: rng.int(2, 6),
      CA: rng.int(2, 6),
      ABC: rng.int(1, 4),
      none: rng.int(3, 10),
    },
    sv: rng.int(0, THREE_SURVEYS.length - 1),
  }),
  ({ mode, region: g, sv }, rng) => {
    const s = THREE_SURVEYS[sv]
    const N = g.oA + g.oB + g.oC + g.AB + g.BC + g.CA + g.ABC + g.none
    const A = g.oA + g.AB + g.CA + g.ABC
    const B = g.oB + g.AB + g.BC + g.ABC
    const C = g.oC + g.BC + g.CA + g.ABC
    const pAB = g.AB + g.ABC
    const pBC = g.BC + g.ABC
    const pCA = g.CA + g.ABC
    const s1 = A + B + C
    const s2 = s1 - pAB - pBC - pCA
    const union = s2 + g.ABC
    const pairSum = pAB + pBC + pCA

    const head = `${s.who}${N}人に、3つの質問A「${s.q[0]}」、B「${s.q[1]}」、C「${s.q[2]}」をした。「はい」と答えた人は、Aが${A}人、Bが${B}人、Cが${C}人であった。また、AとBの両方に「はい」と答えた人は${pAB}人、BとCの両方は${pBC}人、CとAの両方は${pCA}人であった（いずれも、3つすべてに「はい」の人を含む）。`
    const stem = {
      none: `${head}3つすべてに「はい」と答えた人は${g.ABC}人であった。どれにも「はい」と答えなかった人は何人か。`,
      union: `${head}3つすべてに「はい」と答えた人は${g.ABC}人であった。少なくとも1つに「はい」と答えた人は何人か。`,
      all: `${head}どれにも「はい」と答えなかった人は${g.none}人であった。3つすべてに「はい」と答えた人は何人か。`,
    }[mode]
    const target = mode === 'none' ? g.none : mode === 'union' ? union : g.ABC
    const wrong =
      mode === 'none'
        ? [N - s2, N - s2 + g.ABC, union, N - s1, N - union + 2 * g.ABC]
        : mode === 'union'
          ? [s2, s1, s2 - g.ABC, N, s2 + 2 * g.ABC]
          : [s1 - union, pairSum, Math.min(pAB, pBC, pCA), 2 * g.ABC, union - s1 + pairSum + g.ABC]
    const { choices, answer } = peopleChoices(rng, target, wrong, N)

    const formula =
      '少なくとも1つに「はい」の人数 = A + B + C − (AとB) − (BとC) − (CとA) + (3つすべて)'
    const why =
      'A + B + C では、2つに「はい」の人が2回、3つに「はい」の人が3回数えられる。2つずつの重なりを引くと、3つに「はい」の人は3回引かれて0回になってしまうので、最後に3つすべての人を1回足し戻す。'
    const explanation =
      mode === 'all'
        ? [
            `${formula}。`,
            why,
            `少なくとも1つに「はい」の人数 = 全体 − どれにも「はい」でない人 = ${N} − ${g.none} = ${union}`,
            `A + B + C = ${A} + ${B} + ${C} = ${s1}`,
            `2つずつの重なりを引く。${s1} − ${pAB} − ${pBC} − ${pCA} = ${s2}`,
            `式より、${union} = ${s2} + (3つすべて) なので、3つすべて = ${union} − ${s2} = ${g.ABC}`,
            `答え: ${nin(g.ABC)}`,
          ]
        : [
            `${formula}。`,
            why,
            `A + B + C = ${A} + ${B} + ${C} = ${s1}`,
            `2つずつの重なりを引く。${s1} − ${pAB} − ${pBC} − ${pCA} = ${s2}`,
            `3つすべての人を足し戻す。${s2} + ${g.ABC} = ${union}`,
            ...(mode === 'none'
              ? [`どれにも「はい」と答えなかった人 = 全体 − 少なくとも1つ = ${N} − ${union} = ${g.none}`]
              : []),
            `答え: ${nin(target)}`,
          ]
    return {
      stem,
      choices,
      answer,
      targetSec: 100,
      hint: '「A+B+C」から2つずつの重なりを引き、3つすべての人を足し戻す式を使います。',
      explanation,
    }
  },
)

// ---------------------------------------------------------------------------
// 6. 両方に当てはまる人の最少・最大 difficulty 3

export type MinMaxP = { mode: 'minBoth' | 'maxBoth' | 'maxNeither'; N: number; a: number; b: number; sv: number }

const minMax = spec<MinMaxP>(
  { id: 'nv-sets/min-max', topic: 'nv-sets', difficulty: 3, label: '両方の人数の最少・最大' },
  (rng) => {
    const mode = rng.pick<MinMaxP['mode']>(['minBoth', 'maxBoth', 'maxNeither'])
    const N = rng.step(30, 100, 10)
    const sv = rng.int(0, SURVEYS.length - 1)
    if (mode === 'minBoth') {
      const lo = Math.floor(N / 2) + 3
      return { mode, N, a: rng.int(lo, N - 5), b: rng.int(lo, N - 5), sv }
    }
    const lo = Math.floor(N * 0.25)
    const hi = Math.floor(N * 0.7)
    const [a, b] = retry(
      rng,
      (r) => [r.int(lo, hi), r.int(lo, hi)],
      ([x, y]) => x !== y,
    )
    return { mode, N, a, b, sv }
  },
  ({ mode, N, a, b, sv }, rng) => {
    const s = SURVEYS[sv]
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const target = mode === 'minBoth' ? a + b - N : mode === 'maxBoth' ? lo : N - hi
    const wrong =
      mode === 'minBoth'
        ? [lo, a + b, N - lo, Math.abs(a - b), hi]
        : mode === 'maxBoth'
          ? [a + b - N, a + b, hi, N - hi, N - lo]
          : [N - lo, lo, a + b - N, 2 * N - a - b, N - a - b]
    const { choices, answer } = peopleChoices(rng, target, wrong, N)
    const question = {
      minBoth: '両方に当てはまる人は、少なくとも何人いるか。',
      maxBoth: '両方に当てはまる人は、多くても何人か。',
      maxNeither: 'どちらにも当てはまらない人は、多くても何人か。',
    }[mode]
    const explanation =
      mode === 'minBoth'
        ? [
            '両方に当てはまる人が最も少なくなるのは、2つのグループが「できるだけ重ならない」ときである。',
            `2つのグループの人数の合計は ${a} + ${b} = ${a + b}人。全体は${N}人しかいないので、はみ出した ${a + b} − ${N} = ${a + b - N}人は、必ず両方に当てはまる。`,
            `重ならないようにしても、少なくとも ${a + b - N}人は重なる。`,
            `答え: ${nin(target)}`,
          ]
        : mode === 'maxBoth'
          ? [
              '両方に当てはまる人が最も多くなるのは、人数の少ないグループが「すべてもう一方に含まれる」ときである。',
              `人数の少ないグループは${lo}人（${a}人と${b}人のうち小さい方）。両方に当てはまる人は、この${lo}人を超えられない。`,
              `この${lo}人の全員が、多い方のグループ（${hi}人）にも当てはまっているとき、両方に当てはまる人は最大の${lo}人になる。`,
              `答え: ${nin(target)}`,
            ]
          : [
              'どちらにも当てはまらない人が最も多くなるのは、2つのグループが「できるだけ重なる」ときである。',
              `最も重なるのは、人数の少ない方（${lo}人）がすべて、多い方（${hi}人）に含まれるとき。このとき、どちらかに当てはまる人は、多い方の${hi}人だけになる。`,
              `どちらにも当てはまらない人 = 全体 − どちらかに当てはまる人 = ${N} − ${hi} = ${N - hi}`,
              `答え: ${nin(target)}`,
            ]
    return {
      stem: `${s.who}${N}人のうち、「${s.qa}」に当てはまる人が${a}人、「${s.qb}」に当てはまる人が${b}人いる。${question}`,
      choices,
      answer,
      targetSec: 90,
      hint:
        mode === 'minBoth'
          ? '2つのグループをできるだけ離して置いたとき、全体からはみ出す分が必ず重なる人数です。'
          : mode === 'maxBoth'
            ? '重なりが最大になるのは、少ない方が全部もう一方に入るときです。'
            : 'どちらにも当てはまらない人が最大になるのは、2つのグループが最も重なるときです。',
      explanation,
    }
  },
)

// ---------------------------------------------------------------------------

/** テストが総当たりの検証に使う。アプリ本体は default export だけを使う */
export const SPECS = { twoNeither, twoOnly, twoBoth, tableSet, three, minMax }

const generators: Generator[] = Object.values(SPECS).map((s) => s.generator)
export default generators
