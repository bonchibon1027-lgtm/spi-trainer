// アプリ全体で共有するデータの形。
// 玉手箱・構造的把握・英語は v2 以降で TestType / Section に足す（今は足さない）。

export type TestType = 'spi'
export type Section = 'verbal' | 'nonverbal'

export type TopicId =
  // 非言語
  | 'nv-basics'
  | 'nv-ratio'
  | 'nv-profit'
  | 'nv-speed'
  | 'nv-combination'
  | 'nv-probability'
  | 'nv-sets'
  | 'nv-inference'
  | 'nv-discount'
  | 'nv-installment'
  | 'nv-settlement'
  | 'nv-table'
  // 言語
  | 'vb-relation'
  | 'vb-meaning'
  | 'vb-usage'
  | 'vb-order'
  | 'vb-blank'
  | 'vb-reading'

export type Difficulty = 1 | 2 | 3

/**
 * single  : 1つ選ぶ。answer は choices の添字（0始まり）
 * multi   : 当てはまるものを全部選ぶ。answer は添字の配列（昇順）
 * numeric : 数値を入力する（WEBテスティング形式用。v0.9 では使わない）。answer は正解の文字列
 */
export type AnswerFormat = 'single' | 'multi' | 'numeric'

export type Table = {
  caption?: string
  headers: string[]
  rows: string[][]
}

/**
 * 問題文・選択肢・解説の文字列の書き方
 * - 改行は "\n"
 * - 分数は {{分子/分母}}（例: "{{3/5}}"）。画面では縦に積んだ分数で表示する
 *   帯分数や式は文字で書く（例: "1と{{1/2}}"、"{{2/3}} × 6 = 4"）
 */
export type Question = {
  /**
   * 問題を一意に表すキー
   * - 作成問題: "vb-relation-001" のように topic + 3桁連番
   * - 生成問題: "<generatorId>#<seed>"（例: "nv-profit/markup#12345"）。makeGeneratedKey() で作る
   */
  key: string
  testType: TestType
  section: Section
  topic: TopicId
  difficulty: Difficulty
  format: AnswerFormat
  /** 組問題（同じ文章・表に複数問がつく）の共通ID。模試で並べて出すときに使う */
  groupKey?: string
  /** 組問題の共通文章や、推論の前提条件 */
  passage?: string
  table?: Table
  stem: string
  /** single / multi では必須。ラベル（A, B, C…）は画面側で付けるので含めない */
  choices?: string[]
  answer: number | number[] | string
  hint?: string
  /** ステップごとの解説。途中の式を省略しない。最後のステップで答えを明示する */
  explanation: string[]
  /** 目安時間（秒） */
  targetSec: number
  source: 'generated' | 'authored' | 'imported'
  /** 生成問題のみ */
  generatorId?: string
  seed?: number
}

/** 数字を変えて問題を自動生成する「問題の型」 */
export type Generator = {
  /** "<topic>/<型の名前>"（例: "nv-profit/markup"） */
  id: string
  topic: TopicId
  difficulty: Difficulty
  /** 画面に出す型の名前（例: "定価と値引き"） */
  label: string
  /** 同じ seed なら必ず同じ問題を返すこと（復習で同じ問題を出し直すため） */
  generate(seed: number): Question
}

/** 問題データファイル（src/content/questions/*.json）に書く形。足りない項目は読み込み時に分野情報から補う */
export type AuthoredQuestion = Omit<
  Question,
  'testType' | 'section' | 'source' | 'targetSec' | 'generatorId' | 'seed'
> & {
  targetSec?: number
}

/** 解き方ノート（src/content/notes/<topic>.json） */
export type Note = {
  topic: TopicId
  /** この分野で何を聞かれるか（2〜4文） */
  summary: string
  /** 覚える公式（少なく） */
  formulas: { label: string; body: string }[]
  /** 典型的な型と解き方の手順 */
  patterns: { title: string; steps: string[] }[]
  /** 例題（1〜2問）。途中の式を省略しない */
  examples: { stem: string; table?: Table; steps: string[]; answer: string }[]
  /** よくある間違い */
  pitfalls: string[]
}

/** 分野の情報（src/data/topics.ts） */
export type TopicMeta = {
  id: TopicId
  section: Section
  name: string
  /** 出やすさ（3 = よく出る）。おすすめ分野の順位づけに使う */
  frequency: 1 | 2 | 3
  /** 1問の目安時間（秒） */
  targetSec: number
  kind: 'generated' | 'authored'
  /** 1 = 1回目の公開（v0.9）、2 = 2回目の公開（v1.0） */
  release: 1 | 2
}

// ---- 学習記録 ----

export type AttemptMode = 'drill' | 'mock' | 'review'

export type Attempt = {
  questionKey: string
  topic: TopicId
  mode: AttemptMode
  correct: boolean
  usedHint: boolean
  timeMs: number
  /** ISO 8601 日時 */
  at: string
}

/**
 * 復習リストの1件
 * stage 0 = 翌日、1 = 3日後、2 = 7日後。stage 2 で正解したら卒業（リストから外す）
 */
export type ReviewItem = {
  questionKey: string
  topic: TopicId
  /** 生成問題のみ。stage 1 以降は同じ型で新しい seed の問題を出す */
  generatorId?: string
  stage: 0 | 1 | 2
  /** "YYYY-MM-DD"（端末の現地日付）。この日以降に出す */
  dueDate: string
  addedAt: string
}
