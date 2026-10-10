import { describe, expect, it } from 'vitest'
import { AUTHORED_QUESTIONS, noteFiles, questionFiles } from './index'
import { correctChoiceText, validateNote, validateQuestion } from '../lib/validate'

// 作成問題と解き方ノートの検査。ファイルを足したら自動でここの検査対象になる。

describe('作成問題', () => {
  it('key が重複しない', () => {
    const keys = AUTHORED_QUESTIONS.map((q) => q.key)
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i)
    expect(dup).toEqual([])
  })

  for (const [file, qs] of Object.entries(questionFiles)) {
    describe(file, () => {
      it('ファイル名と topic・key がそろっている', () => {
        for (const q of qs) {
          expect(q.topic, q.key).toBe(file)
          expect(q.key, q.key).toMatch(new RegExp(`^${file}-\\d{3}$`))
        }
      })

      it('問題データとして正しい', () => {
        for (const q of AUTHORED_QUESTIONS.filter((x) => x.topic === file)) {
          expect(validateQuestion(q), `${q.key}\n${JSON.stringify(q, null, 2)}`).toEqual([])
        }
      })

      it('解説の最後のステップに正解が書かれている', () => {
        for (const q of AUTHORED_QUESTIONS.filter((x) => x.topic === file)) {
          const correct = correctChoiceText(q)
          if (correct === undefined) continue
          expect(q.explanation[q.explanation.length - 1], q.key).toContain(correct)
        }
      })
    })
  }
})

// 定型の選択肢を使う形式は、選択肢の文言と順番が決まっている
const FIXED_CHOICES: { label: string; match: RegExp; choices: string[] }[] = [
  {
    label: 'ア・イ・ウから同じ関係を選ぶ',
    match: /同じ関係のものをア、イ、ウから選びなさい/,
    choices: ['アだけ', 'イだけ', 'ウだけ', 'アとイ', 'アとウ', 'イとウ'],
  },
  {
    label: '長文読解: ア・イ・ウのうち本文と合致するもの',
    match: /本文の内容と合致するものはどれか/,
    choices: ['アだけ', 'イだけ', 'ウだけ', 'アとイ', 'アとウ', 'イとウ'],
  },
  {
    label: '推論ア・イ・ウのうち必ず正しいもの',
    match: /推論ア、イ、ウのうち、必ず正しいものはどれか/,
    choices: ['アだけ', 'イだけ', 'ウだけ', 'アとイ', 'アとウ', 'イとウ', 'アとイとウ', '必ず正しいものはない'],
  },
]

describe('定型の選択肢', () => {
  for (const f of FIXED_CHOICES) {
    it(f.label, () => {
      for (const q of AUTHORED_QUESTIONS.filter((x) => f.match.test(x.stem))) {
        expect(q.choices, q.key).toEqual(f.choices)
      }
    })
  }
})

describe('解き方ノート', () => {
  for (const [file, note] of Object.entries(noteFiles)) {
    it(`${file} が正しい`, () => {
      expect(note.topic).toBe(file)
      expect(validateNote(note)).toEqual([])
    })
  }
})
