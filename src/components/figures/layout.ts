import type { Figure, Tone } from '../../types'

// 図の配置を決める計算（画面に依存しない純粋な関数）。
// 実際の幅はブラウザでしか分からないので、文字の幅は「全角 = 1em」の目安で見積もり、
// 重なりそうなときは段をずらす・注記に回すなどして読めるようにする。

const FRAC = /\{\{(-?\d+)\/(\d+)\}\}/g

/** 図の色の役割 → CSS クラス名（色そのものは note.css の変数で決める） */
export function toneClass(tone: Tone | undefined, fallback: Tone | 'plain'): string {
  return `fg-t-${tone ?? fallback}`
}

function splitLines(text: string): string[] {
  return String(text ?? '').split(/\r?\n|\\n/)
}

/** 1行ぶんの幅の目安（em）。全角 = 1、数字 = 0.6、半角英字 = 0.6、空白 = 0.3、分数 = 1.1 */
function lineEm(line: string): number {
  let w = 0
  const s = line.replace(FRAC, '\u0001')
  for (const ch of s) {
    if (ch === '\u0001') w += 1.1
    else if (ch === ' ') w += 0.3
    else if (ch.charCodeAt(0) < 0x80) w += 0.6
    else w += 1
  }
  return w
}

/** 文字列の幅の目安（em）。改行があれば最も長い行 */
export function textEm(text: string): number {
  return splitLines(text).reduce((m, l) => Math.max(m, lineEm(l)), 0)
}

/** 行数（\n の数 + 1） */
export function lineCount(text: string): number {
  return splitLines(text).length
}

/** 空白や改行で区切った「ひとかたまり」のうち、いちばん長いものの幅（em）。これより狭いと折り返せない */
export function longestWordEm(text: string): number {
  let m = 0
  for (const line of splitLines(text)) {
    for (const word of line.split(/\s+/)) m = Math.max(m, lineEm(word))
  }
  return m
}

// ---- 段の振り分け ----

export type Interval = { start: number; end: number }

/**
 * 区間が重ならないように、段（0, 1, 2…）へ振り分ける。order の順に、入れられる最も小さい段へ入れる。
 * order を省略すると start の小さい順。戻り値は items と同じ並びの段番号。
 */
export function packLanes(items: Interval[], gap = 0, order?: number[]): number[] {
  const idx = order ?? items.map((_, i) => i).sort((a, b) => items[a].start - items[b].start || items[a].end - items[b].end)
  const lanes: Interval[][] = []
  const result = new Array<number>(items.length).fill(0)
  for (const i of idx) {
    const it = items[i]
    let lane = lanes.findIndex((placed) => placed.every((o) => it.end + gap <= o.start || o.end + gap <= it.start))
    if (lane === -1) {
      lane = lanes.length
      lanes.push([])
    }
    lanes[lane].push(it)
    result[i] = lane
  }
  return result
}

// ---- 数直線・道のり図 ----

/** 見積もりに使う図の幅（px）。スマホの図の幅（約 290〜300px）に合わせる */
export const LINE_W = 300
const LINE_PAD = 26
const POINT_GAP = 6

export type LineAlign = 'c' | 'l' | 'r'
export type LineFigureData = Extract<Figure, { type: 'line' }>

export type PointPlan = {
  /** points の何番目か */
  index: number
  /** 横位置（%） */
  pct: number
  /** 文字を置く段（0 = 線のすぐ下） */
  level: number
  /** c: 点の真下に中央 / r: 点から右へ伸ばす / l: 点から左へ伸ばす */
  align: LineAlign
}

export type SpanPlan = {
  index: number
  fromPct: number
  toPct: number
  lane: number
  /** 文字（ラベル）の中心の横位置（%）。区間の中心だが、はみ出さないよう寄せる */
  textPct: number
  lines: number
}

export type LinePlan = {
  points: PointPlan[]
  spans: SpanPlan[]
  levels: number
  lanes: number
  /** 区間 1段の高さ（px） */
  laneH: number
  /** 点の文字 1段の高さ（px） */
  levelH: number
  /** 図全体の高さ（px） */
  height: number
  /** 線（トラック）の中心の高さ（px） */
  trackY: number
}

const TRACK_ZONE = 24
const SPAN_BAR_ZONE = 16
const SPAN_LINE_H = 24

export function planLine(f: LineFigureData, width = LINE_W): LinePlan {
  const ats = f.points.map((p) => p.at)
  const min = Math.min(...ats)
  const max = Math.max(...ats)
  const range = max - min || 1
  const xOf = (at: number) => LINE_PAD + ((at - min) / range) * (width - 2 * LINE_PAD)

  // ---- 区間（線の上） ----
  const spanInfo = (f.spans ?? []).map((s, index) => {
    const from = xOf(s.from)
    const to = xOf(s.to)
    const tw = Math.min(width - 8, textEm(s.text) * 13.5 + 22)
    const center = Math.min(Math.max((from + to) / 2, tw / 2 + 2), width - tw / 2 - 2)
    const start = Math.min(from, center - tw / 2)
    const end = Math.max(to, center + tw / 2)
    return { index, from, to, center, start, end, lines: lineCount(s.text), size: to - from }
  })
  // 小さい区間ほど線に近い段へ（大きな「全体」は上の段へ）
  const order = spanInfo.map((_, i) => i).sort((a, b) => spanInfo[a].size - spanInfo[b].size || spanInfo[a].from - spanInfo[b].from)
  const spanLane = packLanes(spanInfo, 0, order)
  const lanes = spanInfo.length ? Math.max(...spanLane) + 1 : 0
  const maxLines = spanInfo.length ? Math.max(...spanInfo.map((s) => s.lines)) : 1
  const laneH = SPAN_BAR_ZONE + SPAN_LINE_H * maxLines
  const spans: SpanPlan[] = spanInfo.map((s, i) => ({
    index: s.index,
    fromPct: (s.from / width) * 100,
    toPct: (s.to / width) * 100,
    lane: spanLane[i],
    textPct: (s.center / width) * 100,
    lines: s.lines,
  }))

  // ---- 点の文字（線の下） ----
  const infos = f.points
    .map((p, index) => {
      const x = xOf(p.at)
      const w = Math.max(textEm(p.label) * 15.5, textEm(p.sub ?? '') * 12.5) + 8
      return { index, x, w }
    })
    .sort((a, b) => a.x - b.x || a.index - b.index)

  type Placed = { level: number; start: number; end: number; x: number }
  const placed: Placed[] = []
  const plans: PointPlan[] = []
  const MAX_LEVEL = 6
  for (const p of infos) {
    const cand: Record<LineAlign, Interval> = {
      c: { start: p.x - p.w / 2, end: p.x + p.w / 2 },
      r: { start: p.x - 6, end: p.x - 6 + p.w },
      l: { start: p.x + 6 - p.w, end: p.x + 6 },
    }
    let chosen: { level: number; align: LineAlign } | undefined
    search: for (let level = 0; level <= MAX_LEVEL; level++) {
      for (const align of ['c', 'r', 'l'] as LineAlign[]) {
        const iv = cand[align]
        if (iv.start < 0 || iv.end > width) continue
        if (placed.some((o) => o.level === level && iv.start < o.end + POINT_GAP && o.start < iv.end + POINT_GAP)) continue
        // 下の段に置くときは、点から下へ伸ばす線が上の段の文字を横切らないこと
        if (level > 0 && placed.some((o) => o.level < level && p.x > o.start - 3 && p.x < o.end + 3)) continue
        // すでに下の段にある点の線が、この文字を横切らないこと
        if (placed.some((o) => o.level > level && o.x > iv.start - 3 && o.x < iv.end + 3)) continue
        chosen = { level, align }
        break search
      }
    }
    if (!chosen) {
      // 見つからないときは、いちばん下の段に中央で置く（読めなくなるよりは、重なりを許す）
      chosen = { level: Math.min(MAX_LEVEL, placed.reduce((m, o) => Math.max(m, o.level), -1) + 1), align: 'c' }
    }
    const iv = cand[chosen.align]
    placed.push({ level: chosen.level, start: iv.start, end: iv.end, x: p.x })
    plans.push({ index: p.index, pct: (p.x / width) * 100, level: chosen.level, align: chosen.align })
  }
  plans.sort((a, b) => a.index - b.index)
  const levels = plans.length ? Math.max(...plans.map((p) => p.level)) + 1 : 1
  const hasSub = f.points.some((p) => p.sub)
  const levelH = hasSub ? 46 : 28

  const trackY = lanes * laneH + TRACK_ZONE / 2 + 2
  const height = lanes * laneH + TRACK_ZONE + 6 + levels * levelH

  return { points: plans, spans, levels, lanes, laneH, levelH, height, trackY }
}

// ---- テープ図 ----

export type TapeFigureData = Extract<Figure, { type: 'tape' }>

export type SegPlan = {
  /** 帯の中に文字が収まるか */
  fits: boolean
  /** 収まらないときの印（①②…）。収まるなら空 */
  mark: string
  /** 印を帯の中に出せる幅があるか */
  showMark: boolean
}

export type TapePlan = {
  /** 各行の帯の長さ（全体に対する %）。いちばん長い行が 100 */
  rowPct: number[]
  segs: SegPlan[][]
}

const BAR_W = 292

export function circled(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`
}

export function planTape(rows: TapeFigureData['rows'], barPx = BAR_W): TapePlan {
  const sums = rows.map((r) => r.segments.reduce((s, x) => s + x.size, 0))
  const maxSum = Math.max(...sums, 1)
  const rowPct = sums.map((s) => Math.max(18, (s / maxSum) * 100))
  let n = 0
  const segs = rows.map((r, ri) => {
    const rowPx = (rowPct[ri] / 100) * barPx
    return r.segments.map((s) => {
      const segPx = (s.size / sums[ri]) * rowPx - 3
      const inner = segPx - 14
      const fits = inner >= 12 && longestWordEm(s.text) * 14.5 <= inner && (textEm(s.text) * 14.5) / inner <= 3.2
      if (fits) return { fits: true, mark: '', showMark: false }
      n += 1
      return { fits: false, mark: circled(n), showMark: segPx >= 20 }
    })
  })
  return { rowPct, segs }
}
