import { freshVariant, getQuestionByKey } from './bank'
import type { QuestionSource } from './review'

/** 復習で問題を取り出すときに使う口（bank.ts の関数をそのまま渡す） */
export const bankSource: QuestionSource = { getQuestionByKey, freshVariant }
