import type { Table } from '../../types'
import { RichText } from '../RichText'

/**
 * 表。highlight は強調するマス [rows の行番号, 列番号]。
 * 空欄('')は点線の枠で見せる（分かっていないマス）。表が横に長いときは、表の中だけ横にスクロールする。
 */
export function TableFigure({ table, highlight }: { table: Table; highlight?: [number, number][] }) {
  const hl = new Set((highlight ?? []).map(([r, c]) => `${r},${c}`))
  return (
    <div className="fg-tb-wrap">
      <table className="fg-tb">
        {table.caption && (
          <caption>
            <RichText text={table.caption} />
          </caption>
        )}
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i} scope="col">
                <RichText text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => {
                const on = hl.has(`${i},${j}`)
                const cls = [on ? 'is-hl' : '', c === '' ? 'is-blank' : ''].filter(Boolean).join(' ')
                return (
                  <td key={j} className={cls || undefined}>
                    {c === '' ? <span className="fg-tb-blank" aria-label="空欄" /> : <RichText text={c} />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
