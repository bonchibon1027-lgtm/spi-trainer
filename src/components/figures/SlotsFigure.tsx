import type { Figure } from '../../types'
import { RichText } from '../RichText'
import { toneClass } from './layout'

type SlotsData = Extract<Figure, { type: 'slots' }>

/** 枠の並び（推論の順位・座席、文の並べ替え）。行ごとに枠を横に並べ、head は枠の上に小さく、text は枠の中に大きく */
export function SlotsFigure({ rows }: { rows: SlotsData['rows'] }) {
  return (
    <div className="fg-sl">
      {rows.map((r, ri) => (
        <div className="fg-sl-row" key={ri}>
          {r.label && (
            <div className="fg-sl-label">
              <RichText text={r.label} />
            </div>
          )}
          <div className="fg-sl-cells">
            {r.cells.map((c, ci) => (
              <div className="fg-sl-cell" key={ci}>
                {c.head && (
                  <div className="fg-sl-head">
                    <RichText text={c.head} />
                  </div>
                )}
                <div className={`fg-sl-box ${toneClass(c.tone, 'plain')}${c.text === '' ? ' is-empty' : ''}`}>
                  <RichText text={c.text} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
