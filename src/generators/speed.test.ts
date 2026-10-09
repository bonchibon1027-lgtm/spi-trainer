import { describe, expect, it } from 'vitest'
import speed from './speed'
import type { Question } from '../types'

// 速さ（nv-speed）の型を、問題文の数字から別の方法で解き直して検算する。
// 旅人算は、1分（1秒）ずつ進めるシミュレーションで確かめる。

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 104729 + 17)
const gen = (id: string) => {
  const g = speed.find((x) => x.id === id)
  if (!g) throw new Error(`no generator ${id}`)
  return g
}
const correctText = (q: Question) => q.choices![q.answer as number]
const num = (s: string) => Number(s.replace(/,/g, ''))
const val = (s: string) => parseFloat(s.replace(/,/g, '').replace(/^[^\d-]+/, ''))
/** "10時25分" "8時ちょうど" → 分 */
const clock = (s: string) => {
  const m = /^(\d+)時(?:(\d+)分|ちょうど)$/.exec(s)
  if (!m) throw new Error(`時刻の形が不正: ${s}`)
  return Number(m[1]) * 60 + Number(m[2] ?? 0)
}
const run = (id: string, check: (q: Question, seed: number) => void) => {
  for (const seed of SEEDS) check(gen(id).generate(seed), seed)
}

describe('nv-speed 全般', () => {
  it('4型以上あり、難易度1が2つ以上', () => {
    expect(speed.length).toBeGreaterThanOrEqual(4)
    expect(speed.filter((g) => g.difficulty === 1).length).toBeGreaterThanOrEqual(2)
  })

  for (const g of speed) {
    it(`${g.id}: 選択肢は5つ以上で、解説の最後は「答え: 正解」、値の重複なし`, () => {
      for (const seed of SEEDS) {
        const q = g.generate(seed)
        expect(q.choices!.length, `seed=${seed}`).toBeGreaterThanOrEqual(5)
        expect(q.explanation[q.explanation.length - 1], `seed=${seed}`).toBe(`答え: ${correctText(q)}`)
        const vals = q.choices!.map((c) => (g.id === 'nv-speed/timetable' ? clock(c) : val(c)))
        expect(new Set(vals).size, `seed=${seed} ${q.choices!.join(' / ')}`).toBe(vals.length)
      }
    })
  }
})

describe('nv-speed/unit', () => {
  it('単位換算が正しい', () => {
    const kinds = new Set<string>()
    run('nv-speed/unit', (q, seed) => {
      const c = val(correctText(q))
      let m: RegExpExecArray | null
      if ((m = /^時速(\d+)kmは、分速何mか/.exec(q.stem))) {
        kinds.add('kmh-mpm')
        // 分速 c m で 60 分走ると m km になる
        expect(c * 60, `seed=${seed}`).toBe(Number(m[1]) * 1000)
      } else if ((m = /^分速([\d,]+)mは、時速何kmか/.exec(q.stem))) {
        kinds.add('mpm-kmh')
        expect(c * 1000, `seed=${seed}`).toBe(num(m[1]) * 60)
      } else if ((m = /^時速(\d+)kmは、秒速何mか/.exec(q.stem))) {
        kinds.add('kmh-mps')
        expect(c * 3600, `seed=${seed}`).toBe(Number(m[1]) * 1000)
      } else if ((m = /^秒速(\d+)mは、時速何kmか/.exec(q.stem))) {
        kinds.add('mps-kmh')
        expect(c * 1000, `seed=${seed}`).toBeCloseTo(Number(m[1]) * 3600, 6)
      } else throw new Error(q.stem)
    })
    expect(kinds.size).toBe(4)
  })
})

describe('nv-speed/basic', () => {
  it('速さ・時間・距離が正しい', () => {
    const kinds = new Set<string>()
    run('nv-speed/basic', (q, seed) => {
      const c = val(correctText(q))
      let m: RegExpExecArray | null
      if ((m = /^時速(\d+)kmで(\d+)分間走ると、何km進むか/.exec(q.stem))) {
        kinds.add('dist')
        expect(c * 60, `seed=${seed}`).toBe(Number(m[1]) * Number(m[2]))
      } else if ((m = /^(\d+)kmの道のりを、時速(\d+)kmで進むと、何分かかるか/.exec(q.stem))) {
        kinds.add('time')
        expect(Number(m[2]) * c, `seed=${seed}`).toBe(Number(m[1]) * 60)
      } else if ((m = /^(\d+)kmの道のりを(\d+)分で走った。このときの速さは時速何km/.exec(q.stem))) {
        kinds.add('speed')
        expect(c * Number(m[2]), `seed=${seed}`).toBe(Number(m[1]) * 60)
      } else throw new Error(q.stem)
    })
    expect(kinds.size).toBe(3)
  })
})

describe('nv-speed/timetable', () => {
  it('到着時刻・出発時刻が正しい', () => {
    const kinds = new Set<string>()
    run('nv-speed/timetable', (q, seed) => {
      const ans = clock(correctText(q))
      // 区間の所要時間（分）。割りきれない場合は検出する
      const mins = (d: number, v: number, walk: boolean) => {
        const t = walk ? d / v : (d * 60) / v
        expect(Number.isInteger(t), `seed=${seed} 所要時間が整数でない`).toBe(true)
        return t
      }
      let m: RegExpExecArray | null
      if ((m = /^P地点を(\d+)時(\d+)分に出発し、時速(\d+)kmで(\d+)km先のQ地点まで進んだ。Q地点で(\d+)分休憩したあと、時速(\d+)kmで(\d+)km先のR地点まで進んだ。/.exec(q.stem))) {
        kinds.add('arrive-kmh')
        const total = mins(+m[4], +m[3], false) + +m[5] + mins(+m[7], +m[6], false)
        expect(ans, `seed=${seed}`).toBe(+m[1] * 60 + +m[2] + total)
      } else if ((m = /^P地点を(\d+)時(\d+)分に出発し、分速(\d+)mで([\d,]+)m歩いてQ地点に着いた。そこで(\d+)分休んだあと、分速(\d+)mで([\d,]+)m歩いてR地点に着いた。/.exec(q.stem))) {
        kinds.add('arrive-walk')
        const total = mins(num(m[4]), +m[3], true) + +m[5] + mins(num(m[7]), +m[6], true)
        expect(ans, `seed=${seed}`).toBe(+m[1] * 60 + +m[2] + total)
      } else if ((m = /^R地点に(\d+)時(\d+)分に着きたい。P地点から時速(\d+)kmで(\d+)km先のQ地点まで進む。Q地点で(\d+)分休んだあと、時速(\d+)kmで(\d+)km先のR地点まで進む。/.exec(q.stem))) {
        kinds.add('depart-kmh')
        const total = mins(+m[4], +m[3], false) + +m[5] + mins(+m[7], +m[6], false)
        expect(ans + total, `seed=${seed}`).toBe(+m[1] * 60 + +m[2])
      } else if ((m = /^R地点に(\d+)時(\d+)分に着きたい。P地点から分速(\d+)mで([\d,]+)m歩いてQ地点に着く。Q地点で(\d+)分休んだあと、分速(\d+)mで([\d,]+)m歩いてR地点に着く。/.exec(q.stem))) {
        kinds.add('depart-walk')
        const total = mins(num(m[4]), +m[3], true) + +m[5] + mins(num(m[7]), +m[6], true)
        expect(ans + total, `seed=${seed}`).toBe(+m[1] * 60 + +m[2])
      } else throw new Error(q.stem)
      // 答えの時刻は 0〜24 時の範囲
      expect(ans).toBeGreaterThan(0)
      expect(ans).toBeLessThan(24 * 60)
    })
    expect(kinds.size).toBe(4)
  })
})

describe('nv-speed/round-trip', () => {
  it('往復の平均の速さが正しい（道のりを変えても同じ）', () => {
    run('nv-speed/round-trip', (q, seed) => {
      const m = /行きは時速(\d+)km、帰りは時速(\d+)kmで走った。(?:A地点とB地点の間の道のりは(\d+)kmである。)?/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      const [a, b] = [Number(m![1]), Number(m![2])]
      // 道のりは何でもよいので、与えられていてもいなくても D = a × b × 2 で計算する
      const D = m![3] ? Number(m![3]) : a * b * 2
      const time = D / a + D / b
      expect(val(correctText(q)), `seed=${seed}`).toBeCloseTo((2 * D) / time, 6)
    })
  })
})

describe('nv-speed/meeting', () => {
  it('出会いを1分ずつ進めて確かめる', () => {
    const kinds = new Set<string>()
    run('nv-speed/meeting', (q, seed) => {
      const c = val(correctText(q))
      let m: RegExpExecArray | null
      if ((m = /^A地点とB地点は([\d,]+)m離れている。.+?分速(\d+)mで.+?分速(\d+)mで.+?(何分後か|A地点から何mの地点か)/.exec(q.stem))) {
        const [D, vp, vq] = [num(m[1]), +m[2], +m[3]]
        let t = 0
        while (vp * t + vq * t < D) t++
        expect(vp * t + vq * t, `seed=${seed} 整数分で出会う`).toBe(D)
        if (m[4] === '何分後か') {
          kinds.add('time')
          expect(c, `seed=${seed}`).toBe(t)
        } else {
          kinds.add('where')
          expect(c, `seed=${seed}`).toBe(vp * t)
        }
      } else if ((m = /^1周([\d,]+)mの池.+?反対の向き.+?分速(\d+)m、.+?分速(\d+)m/.exec(q.stem))) {
        kinds.add('lap')
        const [L, vp, vq] = [num(m[1]), +m[2], +m[3]]
        // 反対向きに回る: 進んだ距離の和が 1 周分になる最初の時刻
        let t = 0
        while (vp * t + vq * t < L) t++
        expect(vp * t + vq * t, `seed=${seed}`).toBe(L)
        expect(c, `seed=${seed}`).toBe(t)
      } else throw new Error(q.stem)
    })
    expect(kinds.size).toBe(3)
  })
})

describe('nv-speed/chase', () => {
  it('追いつき・追い抜きを1分ずつ進めて確かめる', () => {
    const kinds = new Set<string>()
    run('nv-speed/chase', (q, seed) => {
      const c = val(correctText(q))
      let m: RegExpExecArray | null
      if ((m = /^Pさんは分速(\d+)mで家を出発した。(\d+)分後に、Qさんが分速(\d+)mで同じ道を追いかけた。.+(Qさんが出発してから何分後か|家から何mの地点か)/.exec(q.stem))) {
        const [vp, h, vq] = [+m[1], +m[2], +m[3]]
        // Qが出発してから t 分後の位置: P = vp × (h + t)、Q = vq × t
        let t = 0
        while (vq * t < vp * (h + t)) t++
        expect(vq * t, `seed=${seed} 整数分で追いつく`).toBe(vp * (h + t))
        if (m[4].startsWith('Qさん')) {
          kinds.add('time')
          expect(c, `seed=${seed}`).toBe(t)
        } else {
          kinds.add('where')
          expect(c, `seed=${seed}`).toBe(vq * t)
        }
      } else if ((m = /^1周([\d,]+)mの池.+?同じ向き.+?Pさんは分速(\d+)m、Qさんは分速(\d+)m/.exec(q.stem))) {
        kinds.add('lap')
        const [L, vp, vq] = [num(m[1]), +m[2], +m[3]]
        let t = 0
        while (vp * t - vq * t < L) t++
        expect(vp * t - vq * t, `seed=${seed}`).toBe(L)
        expect(c, `seed=${seed}`).toBe(t)
      } else throw new Error(q.stem)
    })
    expect(kinds.size).toBe(3)
  })
})

describe('nv-speed/train', () => {
  it('通過算が正しい（1秒ずつ進めて確かめる）', () => {
    const kinds = new Set<string>()
    run('nv-speed/train', (q, seed) => {
      const c = val(correctText(q))
      let m: RegExpExecArray | null
      if ((m = /^長さ(\d+)mの列車が、時速(\d+)kmで走っている。この列車が長さ([\d,]+)mの(?:鉄橋|トンネル)(?:を|に).+までに、何秒かかるか/.exec(q.stem))) {
        kinds.add('time')
        const [L, vk, B] = [+m[1], +m[2], num(m[3])]
        // 時速 vk km = 秒速 vk × 1000 / 3600 m。先頭が橋に入ってから最後尾が出るまで
        const v = (vk * 1000) / 3600
        let t = 0
        while (v * t < L + B) t++
        expect(v * t, `seed=${seed}`).toBe(L + B)
        expect(c, `seed=${seed}`).toBe(t)
      } else if ((m = /^長さ(\d+)mの列車が、時速(\d+)kmで走っている。この列車が(?:鉄橋|トンネル)(?:を|に).+までに(\d+)秒かかった。.+の長さは何mか/.exec(q.stem))) {
        kinds.add('length')
        const [L, vk, t] = [+m[1], +m[2], +m[3]]
        const v = (vk * 1000) / 3600
        // 橋の長さ c を入れると、ちょうど t 秒になる
        expect((L + c) / v, `seed=${seed}`).toBe(t)
        expect(c).toBeGreaterThan(0)
      } else if ((m = /^長さ(\d+)mで秒速(\d+)mの列車Pと、長さ(\d+)mで秒速(\d+)mの列車Qが、反対の向き/.exec(q.stem))) {
        kinds.add('opposite')
        const [L1, v1, L2, v2] = [+m[1], +m[2], +m[3], +m[4]]
        let t = 0
        while ((v1 + v2) * t < L1 + L2) t++
        expect((v1 + v2) * t, `seed=${seed}`).toBe(L1 + L2)
        expect(c, `seed=${seed}`).toBe(t)
      } else if ((m = /^長さ(\d+)mで秒速(\d+)mの列車Pが、同じ向きに進む長さ(\d+)mで秒速(\d+)mの列車Qを追い越す/.exec(q.stem))) {
        kinds.add('overtake')
        const [L1, v1, L2, v2] = [+m[1], +m[2], +m[3], +m[4]]
        expect(v1).toBeGreaterThan(v2)
        let t = 0
        while ((v1 - v2) * t < L1 + L2) t++
        expect((v1 - v2) * t, `seed=${seed}`).toBe(L1 + L2)
        expect(c, `seed=${seed}`).toBe(t)
      } else throw new Error(q.stem)
    })
    expect(kinds.size).toBe(4)
  })
})
