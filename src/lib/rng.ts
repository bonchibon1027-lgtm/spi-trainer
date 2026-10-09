// シード付き乱数。同じ seed からは必ず同じ数列が出る（生成問題の再現に必須）。
// Math.random() は問題生成の中では使わないこと。

export type Rng = {
  /** 0 以上 1 未満 */
  next(): number
  /** min 以上 max 以下の整数 */
  int(min: number, max: number): number
  /** min から max まで step 刻みの値から1つ（例: step(100, 900, 100) → 100,200,…,900） */
  step(min: number, max: number, step: number): number
  pick<T>(items: readonly T[]): T
  /** 新しい配列を返す（元の配列は変えない） */
  shuffle<T>(items: readonly T[]): T[]
  chance(p: number): boolean
}

export function createRng(seed: number): Rng {
  // mulberry32
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  return {
    next,
    int,
    step: (min, max, s) => min + s * int(0, Math.floor((max - min) / s)),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      const arr = items.slice()
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    },
    chance: (p) => next() < p,
  }
}

/** 画面側で新しい問題を出すときの seed。ここだけは Math.random を使ってよい */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}
