import type { Figure } from '../../types'
import { RichText } from '../RichText'
import { FlowFigure } from './FlowFigure'
import { LineFigure } from './LineFigure'
import { SlotsFigure } from './SlotsFigure'
import { TableFigure } from './TableFigure'
import { TapeFigure } from './TapeFigure'
import { TreeFigure } from './TreeFigure'
import { Venn2Figure } from './Venn2Figure'
import '../../styles/note.css'

export { TableFigure }

function Body({ figure }: { figure: Figure }) {
  switch (figure.type) {
    case 'tape':
      return <TapeFigure rows={figure.rows} />
    case 'venn2':
      return <Venn2Figure f={figure} />
    case 'line':
      return <LineFigure f={figure} />
    case 'flow':
      return <FlowFigure items={figure.items} />
    case 'tree':
      return <TreeFigure nodes={figure.nodes} />
    case 'table':
      return <TableFigure table={figure.table} highlight={figure.highlight} />
    case 'slots':
      return <SlotsFigure rows={figure.rows} />
    default:
      return null
  }
}

/** ノートの図を描く。7種類（tape / venn2 / line / flow / tree / table / slots）に対応。caption があれば図の下に小さく出す */
export function FigureView({ figure }: { figure: Figure }) {
  if (!figure || typeof figure !== 'object') return null
  return (
    <figure className={`fg fg-${figure.type}`}>
      <Body figure={figure} />
      {figure.caption && (
        <figcaption className="fg-cap">
          <RichText text={figure.caption} />
        </figcaption>
      )}
    </figure>
  )
}
