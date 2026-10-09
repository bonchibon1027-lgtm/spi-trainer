import type { Generator } from '../types'
import { defineGenerator, retry } from './common'
import { frac, lcm, num } from '../lib/math'
import { R, decStr, mixedChoices, posIntMax, withTarget } from './numeric-util'

// 速さ
// 単位換算 / 速さ・時間・距離 / 時刻表 / 往復の平均 / 旅人算（出会い・追いつき）/ 通過算

const kmh = (n: number) => `時速${decStr(n)}km`
const mpm = (n: number) => `分速${num(R(n))}m`
const mps = (n: number) => `秒速${decStr(n)}m`
const minutes = (n: number) => `${num(R(n))}分`
const minutesAfter = (n: number) => `${num(R(n))}分後`
const meters = (n: number) => `${num(R(n))}m`
const seconds = (n: number) => `${num(R(n))}秒`

// ---------------------------------------------------------------------------
// 1. 速さの単位換算
// ---------------------------------------------------------------------------

const unit = defineGenerator(
  { id: 'nv-speed/unit', topic: 'nv-speed', difficulty: 1, label: '速さの単位換算（時速・分速・秒速）' },
  (rng) => {
    const v = rng.next()

    if (v < 0.3) {
      // 時速 → 分速
      const k = 3 * rng.int(2, 30)
      const ans = (k * 1000) / 60
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [(k * 1000) / 6, k * 1000, k * 60, (k * 100) / 6, k * 10].map(R),
        { format: mpm, padStep: 50, isValid: posIntMax(1500) },
      )
      return {
        stem: `時速${k}kmは、分速何mか。`,
        choices,
        answer,
        hint: '1km = 1000m、1時間 = 60分 です。1時間に進む距離をmで表し、60で割ります。',
        explanation: [
          '時速は「1時間に進む距離」、分速は「1分間に進む距離」。1km = 1000m、1時間 = 60分 で換算する。',
          `時速${k}km は、1時間に ${k} × 1000 = ${num(k * 1000)}m 進む速さ。`,
          `1時間 = 60分なので、${num(k * 1000)} ÷ 60 = ${num(ans)}m（1分間に進む距離）`,
          `答え: ${mpm(ans)}`,
        ],
      }
    }

    if (v < 0.6) {
      // 分速 → 時速
      const k = rng.int(2, 30)
      const m = 50 * k
      const ans = 3 * k
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [m * 60, m / 60, m * 6, m / 6, (m * 60) / 100].map(R),
        { format: kmh, padStep: 3, isValid: posIntMax(150) },
      )
      return {
        stem: `分速${num(m)}mは、時速何kmか。`,
        choices,
        answer,
        hint: '1時間 = 60分 なので、1時間に進む距離を出してから、mをkmに直します。',
        explanation: [
          '分速に60をかけると「1時間に進む距離（m）」になり、1000で割るとkmになる。',
          `1時間（60分）に進む距離 = ${num(m)} × 60 = ${num(m * 60)}m`,
          `${num(m * 60)}m = ${num(m * 60)} ÷ 1000 = ${ans}km`,
          `答え: ${kmh(ans)}`,
        ],
      }
    }

    if (v < 0.8) {
      // 時速 → 秒速
      const s = rng.pick([5, 10, 15, 20, 25, 30, 35, 40])
      const k = (s * 36) / 10
      const { choices, answer } = mixedChoices(
        rng,
        s,
        [(k * 1000) / 60, k * 3.6, k / 60, k / 6, (k * 1000) / 360].map(R),
        { format: mps, padStep: 1, isValid: posIntMax(60) },
      )
      return {
        stem: `時速${k}kmは、秒速何mか。`,
        choices,
        answer,
        hint: '1時間 = 3600秒 です。1時間に進む距離をmで表して、3600で割ります。',
        explanation: [
          '1km = 1000m、1時間 = 60分 = 3600秒 で換算する。',
          `時速${k}km は、1時間に ${k} × 1000 = ${num(k * 1000)}m 進む速さ。`,
          `${num(k * 1000)} ÷ 3600 = ${s}m（1秒間に進む距離）`,
          `答え: ${mps(s)}`,
        ],
      }
    }

    // 秒速 → 時速
    const s = rng.pick([5, 10, 15, 20, 25, 30, 35, 40])
    const k = (s * 36) / 10
    const { choices, answer } = mixedChoices(
      rng,
      k,
      [s * 60, s * 36, s / 3.6, (s * 3600) / 100, s * 6].map(R),
      { format: kmh, padStep: 6, isValid: (x) => x > 0 && x <= 150 && Math.abs(x * 10 - Math.round(x * 10)) < 1e-6 },
    )
    return {
      stem: `秒速${s}mは、時速何kmか。`,
      choices,
      answer,
      hint: '1時間 = 3600秒 です。1時間に進む距離をmで表してから、kmに直します。',
      explanation: [
        '秒速に3600をかけると「1時間に進む距離（m）」になり、1000で割るとkmになる。',
        `1時間（3600秒）に進む距離 = ${s} × 3600 = ${num(s * 3600)}m`,
        `${num(s * 3600)}m = ${num(s * 3600)} ÷ 1000 = ${decStr(k)}km`,
        `答え: ${kmh(k)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 2. 速さ・時間・距離の基本
// ---------------------------------------------------------------------------

const KMH_LIST = [12, 15, 18, 20, 24, 30, 36, 40, 45, 48, 60, 72]
const MIN_LIST = [10, 15, 20, 25, 30, 40, 45]

const basic = defineGenerator(
  { id: 'nv-speed/basic', topic: 'nv-speed', difficulty: 1, label: '速さ・時間・距離の基本' },
  (rng) => {
    const { v, t } = retry(
      rng,
      (r) => ({ v: r.pick(KMH_LIST), t: r.pick(MIN_LIST) }),
      ({ v, t }) => (v * t) % 60 === 0 && (v * t) / 60 >= 2,
    )
    const d = (v * t) / 60
    const km = (n: number) => `${decStr(n)}km`
    const k = rng.next()

    if (k < 0.35) {
      // 距離
      const { choices, answer } = mixedChoices(
        rng,
        d,
        [v * t, (v * t) / 100, v / t, (v * t) / 6, d + 5].map(R),
        { format: km, padStep: Math.max(1, Math.round(d * 0.1)), isValid: posIntMax(100) },
      )
      return {
        stem: `時速${v}kmで${t}分間走ると、何km進むか。`,
        choices,
        answer,
        hint: '時間を「時間」の単位にそろえます。分を60で割ると時間になります。',
        explanation: [
          '距離 = 速さ × 時間。速さが「時速」なので、時間も「時間」の単位にそろえる。',
          `${t}分 = ${t} ÷ 60 = ${frac(t, 60)}時間`,
          `距離 = ${v} × ${frac(t, 60)} = ${decStr(d)}km`,
          `答え: ${km(d)}`,
        ],
      }
    }

    if (k < 0.7) {
      // 時間
      const { choices, answer } = mixedChoices(
        rng,
        t,
        [(d / v) * 100, d * v, (d / v) * 10, (v / d) * 10, t + 10].map(R),
        { format: minutes, padStep: 5, isValid: posIntMax(240) },
      )
      return {
        stem: `${d}kmの道のりを、時速${v}kmで進むと、何分かかるか。`,
        choices,
        answer,
        hint: '時間 = 距離 ÷ 速さ で「時間」の単位の答えが出ます。60をかけて分に直しましょう。',
        explanation: [
          '時間 = 距離 ÷ 速さ。速さが「時速」なので、答えは「時間」の単位で出る。',
          `${d} ÷ ${v} = ${frac(d, v)}時間`,
          `${frac(d, v)}時間 = ${frac(d, v)} × 60 = ${t}分`,
          `答え: ${minutes(t)}`,
        ],
      }
    }

    // 速さ
    const { choices, answer } = mixedChoices(
      rng,
      v,
      [(d * 100) / t, d * 60, (d / t) * 10, d * t, v + 6].map(R),
      { format: kmh, padStep: 6, isValid: posIntMax(150) },
    )
    return {
      stem: `${d}kmの道のりを${t}分で走った。このときの速さは時速何kmか。`,
      choices,
      answer,
      hint: '速さ = 距離 ÷ 時間。時間を「時間」の単位にそろえて計算します。',
      explanation: [
        '速さ = 距離 ÷ 時間。「時速」を求めるので、時間は「時間」の単位にそろえる。',
        `${t}分 = ${t} ÷ 60 = ${frac(t, 60)}時間`,
        `速さ = ${d} ÷ ${frac(t, 60)} = ${d} × ${frac(60, t)} = ${v}`,
        `答え: ${kmh(v)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 3. 時刻表型（出発時刻・到着時刻）
// ---------------------------------------------------------------------------

function fmtTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}時ちょうど` : `${h}時${m}分`
}

type Seg = { v: number; t: number; d: number }

const WALK_V = [40, 50, 60, 70, 75, 80, 90, 100]
const WALK_T = [5, 10, 15, 20, 25, 30, 40]
const TT_KMH_V = [12, 15, 18, 20, 24, 30, 36, 40, 45, 48, 60]
const TT_KMH_T = [10, 15, 20, 25, 30, 40, 45]

const timetable = defineGenerator(
  { id: 'nv-speed/timetable', topic: 'nv-speed', difficulty: 2, label: '時刻表型（到着時刻・出発時刻）' },
  (rng) => {
    const walk = rng.chance(0.45)
    const arrive = rng.chance(0.55)
    const mkSeg = (): Seg => {
      if (walk) {
        const v = rng.pick(WALK_V)
        const t = rng.pick(WALK_T)
        return { v, t, d: v * t }
      }
      return retry(
        rng,
        (r) => {
          const v = r.pick(TT_KMH_V)
          const t = r.pick(TT_KMH_T)
          return { v, t, d: (v * t) / 60 }
        },
        (s) => Number.isInteger(s.d) && s.d >= 2,
      )
    }
    const s1 = mkSeg()
    const s2 = retry(rng, mkSeg, (s) => s.v !== s1.v || s.t !== s1.t)
    const w = rng.pick([5, 10, 15, 20])
    const tot = s1.t + w + s2.t
    // 基準の時刻（到着問題では出発時刻、出発問題では到着時刻）。答えの「分」が 0 にならないものを選ぶ
    const base = retry(
      rng,
      (r) => 60 * r.int(6, 16) + r.step(5, 55, 5),
      (b) => (arrive ? b + tot : b - tot) % 60 !== 0,
    )
    const start2 = arrive ? base : base - tot
    const target2 = arrive ? base + tot : base
    const ans = arrive ? target2 : start2

    const Hs = Math.floor(start2 / 60)
    const Ms = start2 % 60
    const Ht = Math.floor(target2 / 60)
    const Mt = target2 % 60

    const goText = (s: Seg, to: string) => (walk ? `分速${s.v}mで${num(s.d)}m歩いて${to}に着いた` : `時速${s.v}kmで${s.d}km先の${to}まで進んだ`)
    const goTextFuture = (s: Seg, to: string) => (walk ? `分速${s.v}mで${num(s.d)}m歩いて${to}に着く` : `時速${s.v}kmで${s.d}km先の${to}まで進む`)

    const stem = arrive
      ? walk
        ? `P地点を${Hs}時${Ms}分に出発し、${goText(s1, 'Q地点')}。そこで${w}分休んだあと、${goText(s2, 'R地点')}。R地点に着いた時刻は何時何分か。`
        : `P地点を${Hs}時${Ms}分に出発し、${goText(s1, 'Q地点')}。Q地点で${w}分休憩したあと、${goText(s2, 'R地点')}。R地点に着く時刻は何時何分か。`
      : `R地点に${Ht}時${Mt}分に着きたい。P地点から${goTextFuture(s1, 'Q地点')}。Q地点で${w}分休んだあと、${goTextFuture(s2, 'R地点')}。P地点を遅くとも何時何分に出発すればよいか。`

    // 途中式: 各区間の時間
    const segStep = (s: Seg, a: string, b: string) =>
      walk
        ? `${a}→${b}: ${num(s.d)} ÷ ${s.v} = ${s.t}分`
        : `${a}→${b}: ${s.d} ÷ ${s.v} = ${frac(s.d, s.v)}時間。${frac(s.d, s.v)} × 60 = ${s.t}分`

    const steps: string[] = [
      walk
        ? '時間 = 距離 ÷ 速さ。区間ごとの時間を分で求める。'
        : '時間 = 距離 ÷ 速さ。「時間」の単位で出るので、60をかけて分に直す。',
      segStep(s1, 'P', 'Q'),
      segStep(s2, 'Q', 'R'),
      `休憩を含めた所要時間の合計 = ${s1.t} + ${w} + ${s2.t} = ${tot}分`,
    ]
    if (arrive) {
      const sum = Ms + tot
      const hh = Math.floor(sum / 60)
      const rr = sum % 60
      steps.push(
        sum < 60
          ? `${Hs}時${Ms}分 + ${tot}分：分どうしを足して ${Ms} + ${tot} = ${sum}分 なので、${Hs}時${sum}分`
          : `${Hs}時${Ms}分 + ${tot}分：分どうしを足して ${Ms} + ${tot} = ${sum}分 = ${hh}時間${rr}分 なので、${Hs}時 + ${hh}時間 = ${Hs + hh}時、つまり ${Hs + hh}時${rr}分`,
      )
    } else {
      const th = Math.floor(tot / 60)
      const tr = tot % 60
      const h1 = Ht - th
      if (th > 0) steps.push(`${tot}分 = ${th}時間${tr}分。まず時間を引く：${Ht}時 − ${th}時間 = ${h1}時`)
      if (Mt >= tr) {
        steps.push(`次に分を引く：${h1}時${Mt}分 − ${tr}分 = ${h1}時${Mt - tr}分`)
      } else {
        steps.push(
          `${Mt}分から${tr}分は引けないので、1時間を60分にして借りる：${h1 - 1}時${Mt + 60}分 − ${tr}分 = ${h1 - 1}時${Mt + 60 - tr}分`,
        )
      }
    }
    steps.push(`答え: ${fmtTime(ans)}`)

    // 選択肢
    const s2slow = walk ? Math.round(s2.d / s1.v) : Math.round((s2.d / s1.v) * 60) // 2区間とも1区間目の速さで計算した
    const diff = s2slow - s2.t
    const cands = arrive
      ? [ans - w, ans + 10, ans - 10, ans + diff, ans - 5, ans + 60]
      : [ans + w, ans - w, ans + 10, ans - 10, ans + diff, ans - 60]
    const { choices, answer } = mixedChoices(rng, ans, cands, {
      format: fmtTime,
      padStep: 5,
      isValid: (x) => x > 0 && x < 24 * 60 && Number.isInteger(x),
    })
    return {
      stem,
      choices,
      answer,
      hint: arrive
        ? '各区間の所要時間と休憩時間を足し合わせ、出発時刻に加えます。'
        : '各区間の所要時間と休憩時間を足し合わせ、到着時刻から引きます。',
      explanation: steps,
    }
  },
)

// ---------------------------------------------------------------------------
// 4. 往復の平均の速さ
// ---------------------------------------------------------------------------

const ROUND_PAIRS: { a: number; b: number }[] = (() => {
  const out: { a: number; b: number }[] = []
  // 現実的な組み合わせにする: 速い方は遅い方の2倍まで、片道は180km以内
  for (let a = 15; a <= 120; a += 5) {
    for (let b = a + 5; b <= Math.min(120, 2 * a); b += 5) {
      if ((2 * a * b) % (a + b) === 0 && lcm(a, b) <= 180) out.push({ a, b })
    }
  }
  return out
})()

const roundTrip = defineGenerator(
  { id: 'nv-speed/round-trip', topic: 'nv-speed', difficulty: 2, label: '往復の平均の速さ' },
  (rng) => {
    const pair = rng.pick(ROUND_PAIRS)
    const [a, b] = rng.chance(0.5) ? [pair.a, pair.b] : [pair.b, pair.a]
    const L = lcm(a, b)
    const given = rng.chance(0.4)
    const D = given ? L * rng.pick([1, 2, 3].filter((k) => L * k <= 180)) : L
    const tGo = D / a
    const tBack = D / b
    const T = tGo + tBack
    const ans = (2 * D) / T
    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [(a + b) / 2, (a * b) / (a + b), Math.abs(a - b), a + b, ans + 2].map(R),
      {
        format: kmh,
        padStep: Math.max(2, Math.round(ans * 0.05)),
        isValid: (x) => x > 0 && x <= 200 && Math.abs(x * 2 - Math.round(x * 2)) < 1e-6,
      },
    )
    return {
      stem: `A地点とB地点の間を往復した。行きは時速${a}km、帰りは時速${b}kmで走った。${given ? `A地点とB地点の間の道のりは${D}kmである。` : ''}往復全体の平均の速さは、時速何kmか。`,
      choices,
      answer,
      hint: '速さの平均を取ってはいけません。「往復の道のり ÷ 往復にかかった時間」で求めます。',
      explanation: [
        given
          ? '平均の速さ = 往復の道のり ÷ 往復にかかった時間。（速さの平均を取らない）'
          : `平均の速さ = 往復の道のり ÷ 往復にかかった時間。道のりが与えられていないので、計算しやすいように片道を ${D}km（${a} と ${b} の最小公倍数）とおく。`,
        `行き: ${D} ÷ ${a} = ${decStr(tGo)}時間、帰り: ${D} ÷ ${b} = ${decStr(tBack)}時間`,
        `往復の道のり = ${D} × 2 = ${2 * D}km、かかった時間 = ${decStr(tGo)} + ${decStr(tBack)} = ${decStr(T)}時間`,
        `平均の速さ = ${2 * D} ÷ ${decStr(T)} = ${decStr(ans)}`,
        `答え: ${kmh(ans)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 5. 旅人算（出会い）
// ---------------------------------------------------------------------------

const meeting = defineGenerator(
  { id: 'nv-speed/meeting', topic: 'nv-speed', difficulty: 2, label: '旅人算（出会い）' },
  (rng) => {
    const { vp, vq } = retry(
      rng,
      (r) => ({ vp: r.step(50, 150, 10), vq: r.step(50, 150, 10) }),
      ({ vp, vq }) => vp !== vq,
    )
    const k = rng.next()
    const t = k < 0.7 ? rng.int(6, 25) : rng.int(4, 12) // 池の周回は距離が長くなりすぎないよう短めに
    const sum = vp + vq
    const D = sum * t

    if (k < 0.4) {
      const { choices, answer } = mixedChoices(
        rng,
        t,
        [D / vp, D / vq, D / Math.abs(vp - vq), (2 * D) / sum, t * 2].map(R),
        { format: minutesAfter, padStep: Math.max(1, Math.round(t * 0.1)), isValid: posIntMax(120) },
      )
      return {
        stem: `A地点とB地点は${num(D)}m離れている。PさんはA地点からB地点に向かって分速${vp}mで、QさんはB地点からA地点に向かって分速${vq}mで、同時に出発した。2人が出会うのは、出発してから何分後か。`,
        choices,
        answer,
        hint: '向かい合って進む2人は、1分間に「2人の速さの合計」だけ近づきます。',
        explanation: [
          '向かい合って進むとき、2人の間の距離は1分間に「2人の速さの和」だけ縮まる。',
          `1分間に縮まる距離 = ${vp} + ${vq} = ${sum}m`,
          `出会うまでの時間 = 距離 ÷ 縮まる速さ = ${num(D)} ÷ ${sum} = ${t}分`,
          `答え: ${minutesAfter(t)}`,
        ],
      }
    }

    if (k < 0.7) {
      const ans = vp * t
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [vq * t, D / 2, 2 * vp * t, vp * t + 100].map(R),
        { format: meters, padStep: 100, isValid: posIntMax(9000) },
      )
      return {
        stem: `A地点とB地点は${num(D)}m離れている。PさんはA地点からB地点に向かって分速${vp}mで、QさんはB地点からA地点に向かって分速${vq}mで、同時に出発した。2人が出会うのは、A地点から何mの地点か。`,
        choices,
        answer,
        hint: 'まず出会うまでの時間を求め、その時間にPさんが進んだ距離を計算します。',
        explanation: [
          '向かい合って進むとき、2人の間の距離は1分間に「2人の速さの和」だけ縮まる。',
          `出会うまでの時間 = ${num(D)} ÷ (${vp} + ${vq}) = ${num(D)} ÷ ${sum} = ${t}分`,
          `Pさんは${t}分間に ${vp} × ${t} = ${num(ans)}m 進む。PさんはA地点から出発したので、A地点から${num(ans)}mの地点。`,
          `答え: ${meters(ans)}`,
        ],
      }
    }

    const L = D
    const { choices, answer } = mixedChoices(
      rng,
      t,
      [L / Math.abs(vp - vq), L / vp, L / vq, t * 2, Math.round(t / 2)].map(R),
      { format: minutesAfter, padStep: Math.max(1, Math.round(t * 0.1)), isValid: posIntMax(120) },
    )
    return {
      stem: `1周${num(L)}mの池のまわりを、PさんとQさんが同じ地点から、反対の向きに同時に出発した。Pさんは分速${vp}m、Qさんは分速${vq}mで歩く。2人が初めて出会うのは、出発してから何分後か。`,
      choices,
      answer,
      hint: '反対向きに回ると、2人合わせて池を1周したときに出会います。',
      explanation: [
        '反対向きに回るとき、2人が合わせて池を1周分進んだところで出会う。1分間に近づく距離は「2人の速さの和」。',
        `1分間に近づく距離 = ${vp} + ${vq} = ${sum}m`,
        `出会うまでの時間 = 1周の長さ ÷ 速さの和 = ${num(L)} ÷ ${sum} = ${t}分`,
        `答え: ${minutesAfter(t)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 6. 旅人算（追いつき）
// ---------------------------------------------------------------------------

const chase = defineGenerator(
  { id: 'nv-speed/chase', topic: 'nv-speed', difficulty: 2, label: '旅人算（追いつき）' },
  (rng) => {
    const k = rng.next()

    if (k < 0.75) {
      const { vp, h, diff } = retry(
        rng,
        (r) => ({ vp: r.step(50, 90, 10), h: r.pick([5, 10, 15, 20]), diff: r.pick([10, 20, 25, 30, 40]) }),
        ({ vp, h, diff }) => {
          const t = (vp * h) / diff
          return Number.isInteger(t) && t >= 5 && t <= 40
        },
      )
      const vq = vp + diff
      const gap = vp * h
      const t = gap / diff
      const where = k < 0.4
      if (!where) {
        const { choices, answer } = mixedChoices(
          rng,
          t,
          [gap / (vp + vq), t + h, h, gap / vq, gap].map(R),
          { format: minutesAfter, padStep: Math.max(1, Math.round(t * 0.1)), isValid: posIntMax(120) },
        )
        return {
          stem: `Pさんは分速${vp}mで家を出発した。${h}分後に、Qさんが分速${vq}mで同じ道を追いかけた。QさんがPさんに追いつくのは、Qさんが出発してから何分後か。`,
          choices,
          answer,
          hint: 'Qさんが出発するとき、2人はすでに離れています。その距離を、1分間に縮まる距離で割ります。',
          explanation: [
            `Qさんが出発するとき、Pさんはすでに ${vp} × ${h} = ${num(gap)}m 先にいる。`,
            `同じ向きに進むとき、1分間に縮まる距離は「速さの差」。${vq} − ${vp} = ${diff}m`,
            `追いつくまでの時間 = ${num(gap)} ÷ ${diff} = ${t}分`,
            `答え: ${minutesAfter(t)}`,
          ],
        }
      }
      const ans = vq * t
      const { choices, answer } = mixedChoices(
        rng,
        ans,
        [gap, vp * t, vq * (t + h), vp * (t + h) + vp, ans + 100].map(R),
        { format: meters, padStep: 100, isValid: posIntMax(8000) },
      )
      return {
        stem: `Pさんは分速${vp}mで家を出発した。${h}分後に、Qさんが分速${vq}mで同じ道を追いかけた。QさんがPさんに追いつくのは、家から何mの地点か。`,
        choices,
        answer,
        hint: 'まず追いつくまでの時間を求め、その時間にQさんが進んだ距離を計算します。',
        explanation: [
          `Qさんが出発するとき、Pさんはすでに ${vp} × ${h} = ${num(gap)}m 先にいる。`,
          `1分間に縮まる距離は速さの差。${vq} − ${vp} = ${diff}m。追いつくまでの時間 = ${num(gap)} ÷ ${diff} = ${t}分`,
          `Qさんは${t}分間に ${vq} × ${t} = ${num(ans)}m 進む。Qさんは家から出発したので、家から${num(ans)}mの地点。`,
          `答え: ${meters(ans)}`,
        ],
      }
    }

    // 池を同じ向きに回る
    const { vp, vq, t } = retry(
      rng,
      (r) => ({ vp: r.step(70, 150, 10), vq: r.step(40, 120, 10), t: r.int(5, 40) }),
      ({ vp, vq }) => vp > vq,
    )
    const diff = vp - vq
    const L = diff * t
    const { choices, answer } = mixedChoices(
      rng,
      t,
      [L / (vp + vq), L / vp, L / vq, t * 2, Math.round(t / 2)].map(R),
      { format: minutesAfter, padStep: Math.max(1, Math.round(t * 0.1)), isValid: posIntMax(120) },
    )
    return {
      stem: `1周${num(L)}mの池のまわりを、PさんとQさんが同じ地点から、同じ向きに同時に出発した。Pさんは分速${vp}m、Qさんは分速${vq}mで歩く。PさんがQさんを初めて追い抜くのは、出発してから何分後か。`,
      choices,
      answer,
      hint: '同じ向きに回るとき、速い人が1周分多く進んだところで追い抜きます。',
      explanation: [
        '同じ向きに回るとき、速い人が遅い人より1周分（池の長さ）多く進んだところで追い抜く。1分間に開く差は「速さの差」。',
        `1分間に開く差 = ${vp} − ${vq} = ${diff}m`,
        `追い抜くまでの時間 = 1周の長さ ÷ 速さの差 = ${num(L)} ÷ ${diff} = ${t}分`,
        `答え: ${minutesAfter(t)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 7. 通過算
// ---------------------------------------------------------------------------

const train = defineGenerator(
  { id: 'nv-speed/train', topic: 'nv-speed', difficulty: 3, label: '通過算（鉄橋・トンネル・すれ違い）' },
  (rng) => {
    const k = rng.next()
    const KMH_MPS: [number, number][] = [
      [36, 10],
      [54, 15],
      [72, 20],
      [90, 25],
      [108, 30],
    ]

    if (k < 0.6) {
      const [vk, vs] = rng.pick(KMH_MPS)
      const { L, t } = retry(
        rng,
        (r) => ({ L: r.pick([50, 80, 100, 120, 150, 200]), t: r.int(10, 50) }),
        ({ L, t }) => vs * t - L >= 100,
      )
      const B = vs * t - L
      const bridge = rng.chance(0.5)
      const place = bridge ? '鉄橋' : 'トンネル'
      const verb = bridge ? 'を渡り始めてから渡り終える' : 'に入り始めてから出終わる'
      const convert = [
        `時速${vk}kmを秒速に直す。時速${vk}km = 1時間に ${num(vk * 1000)}m 進む速さ。1時間 = 3600秒なので、${num(vk * 1000)} ÷ 3600 = ${vs}。つまり秒速${vs}m（時速を3.6で割ってもよい）。`,
      ]

      if (rng.chance(0.65)) {
        const { choices, answer } = mixedChoices(
          rng,
          t,
          [B / vs, L / vs, (B - L) / vs, (L + B) / (vs / 2), t + 5].map(R),
          { format: seconds, padStep: 5, isValid: posIntMax(120) },
        )
        return {
          stem: `長さ${L}mの列車が、時速${vk}kmで走っている。この列車が長さ${num(B)}mの${place}${verb}までに、何秒かかるか。`,
          choices,
          answer,
          hint: `列車が進む距離は「${place}の長さ + 列車の長さ」です。速さを秒速に直してから時間を求めます。`,
          explanation: [
            `列車の先頭が${place}に入ってから、最後尾が${place}を出るまでに進む距離 = ${place}の長さ + 列車の長さ`,
            ...convert,
            `進む距離 = ${num(B)} + ${L} = ${num(B + L)}m`,
            `時間 = 距離 ÷ 速さ = ${num(B + L)} ÷ ${vs} = ${t}秒`,
            `答え: ${seconds(t)}`,
          ],
        }
      }
      const { choices, answer } = mixedChoices(
        rng,
        B,
        [vs * t, vs * t + L, B + 2 * L, vs * t - 2 * L, B + 50].map(R),
        { format: meters, padStep: 50, isValid: posIntMax(3000) },
      )
      return {
        stem: `長さ${L}mの列車が、時速${vk}kmで走っている。この列車が${place}${verb}までに${t}秒かかった。${place}の長さは何mか。`,
        choices,
        answer,
        hint: `列車が進んだ距離から、列車自身の長さを引くと${place}の長さになります。`,
        explanation: [
          ...convert,
          `${t}秒間に進んだ距離 = ${vs} × ${t} = ${num(vs * t)}m`,
          `進んだ距離 = ${place}の長さ + 列車の長さ なので、${place}の長さ = ${num(vs * t)} − ${L} = ${num(B)}m`,
          `答え: ${meters(B)}`,
        ],
      }
    }

    // 列車どうしのすれ違い・追い越し
    const opposite = k < 0.8
    const { L1, L2, v1, v2, t } = retry(
      rng,
      (r) => {
        const L1 = r.pick([100, 120, 150, 200])
        const L2 = r.pick([80, 100, 120, 150])
        const S = L1 + L2
        // 速さ（和または差）は、長さの合計を割りきれるものから選ぶ
        const sps = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60].filter(
          (x) => S % x === 0 && S / x >= 4 && S / x <= 40 && (opposite || x <= 25),
        )
        if (sps.length === 0) return { L1, L2, v1: 0, v2: 0, t: 0 }
        const spd = r.pick(sps)
        const v2 = r.step(10, 30, 5)
        const v1 = opposite ? spd - v2 : spd + v2
        return { L1, L2, v1, v2, t: S / spd }
      },
      ({ v1, v2, t }) => t > 0 && v1 >= 10 && v2 >= 10 && v1 <= 40 && v2 <= 35 && v1 !== v2,
    )
    const sp = opposite ? v1 + v2 : v1 - v2
    const { choices, answer } = mixedChoices(
      rng,
      t,
      [
        (L1 + L2) / (opposite ? v1 - v2 : v1 + v2), // 速さの和と差を逆にした
        (L1 + L2) / v1,
        L1 / sp,
        (L1 + L2) / sp / 2,
        t + 2,
      ].map(R),
      { format: seconds, padStep: 2, isValid: posIntMax(120) },
    )
    return {
      stem: opposite
        ? `長さ${L1}mで秒速${v1}mの列車Pと、長さ${L2}mで秒速${v2}mの列車Qが、反対の向きに進んで、すれ違った。Pの先頭とQの先頭が出会ってから、Pの最後尾とQの最後尾が離れるまでに、何秒かかるか。`
        : `長さ${L1}mで秒速${v1}mの列車Pが、同じ向きに進む長さ${L2}mで秒速${v2}mの列車Qを追い越す。Pの先頭がQの最後尾に並んでから、Pの最後尾がQの先頭を過ぎるまでに、何秒かかるか。`,
      choices,
      answer,
      hint: opposite
        ? 'すれ違うとき、2つの列車の長さの合計だけ離れるまでの時間です。近づく速さは速さの和です。'
        : '追い越すとき、2つの列車の長さの合計だけ差が開くまでの時間です。差が開く速さは速さの差です。',
      explanation: [
        `すれ違い（追い越し）にかかる間に、2つの列車は「長さの合計」だけ相対的に進む。長さの合計 = ${L1} + ${L2} = ${L1 + L2}m`,
        opposite
          ? `反対向きなので、1秒間に近づく距離は速さの和。${v1} + ${v2} = ${sp}m`
          : `同じ向きなので、1秒間に差が開く距離は速さの差。${v1} − ${v2} = ${sp}m`,
        `時間 = ${L1 + L2} ÷ ${sp} = ${t}秒`,
        `答え: ${seconds(t)}`,
      ],
    }
  },
)

const generators: Generator[] = [
  withTarget(unit, 40),
  withTarget(basic, 60),
  withTarget(timetable, 100),
  withTarget(roundTrip, 90),
  withTarget(meeting, 80),
  withTarget(chase, 90),
  withTarget(train, 100),
]
export default generators
