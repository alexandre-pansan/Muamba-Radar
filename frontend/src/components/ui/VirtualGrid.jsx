import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

// Mesmas medidas da .product-grid (minmax(280px, 1fr), gap 14px).
const MIN_CARD_WIDTH = 280
const GAP = 14

/**
 * Grade de cards virtualizada: só existem no DOM as linhas visíveis + ~1 tela acima e
 * abaixo. Busca ampla ("perfume") traz milhares de produtos — renderizar tudo de uma
 * vez travava o navegador.
 *
 * scrollRef: o elemento que rola (na busca, a <section className="results">).
 * Linhas têm altura medida de verdade (measureElement), então card mais alto não
 * quebra o layout.
 */
export default function VirtualGrid({ items, getKey, renderItem, scrollRef, estimateRowHeight = 470 }) {
  const gridRef = useRef(null)
  const [columns, setColumns] = useState(1)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(800)

  // Colunas = quantas cabem na largura (igual ao auto-fill do CSS); recalcula no resize.
  useLayoutEffect(() => {
    const grid = gridRef.current
    const scroller = scrollRef?.current
    if (!grid) return
    function measure() {
      const width = grid.clientWidth
      setColumns(Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP))))
      if (scroller) {
        // distância do topo do conteúdo rolável até a grade (avisos acima dela etc.)
        const offset = grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
        setScrollMargin(offset)
        setViewportHeight(scroller.clientHeight || 800)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(grid)
    if (scroller) ro.observe(scroller)
    return () => ro.disconnect()
  }, [scrollRef])

  const rowCount = Math.ceil(items.length / columns)
  // "1 tela acima e abaixo": quantas linhas cabem numa tela, no mínimo 2.
  const overscan = Math.max(2, Math.ceil(viewportHeight / estimateRowHeight))

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef?.current || null,
    estimateSize: () => estimateRowHeight,
    overscan,
    scrollMargin,
    gap: GAP,
  })

  // Lista nova (outra busca, filtro): mede tudo de novo.
  useEffect(() => { virtualizer.measure() }, [items, columns]) // eslint-disable-line react-hooks/exhaustive-deps

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div ref={gridRef} className="virtual-grid" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualRows.map(row => {
        const start = row.index * columns
        const rowItems = items.slice(start, start + columns)
        return (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="virtual-grid__row"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start - scrollMargin}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: GAP,
            }}
          >
            {rowItems.map((item, i) => (
              <React.Fragment key={getKey(item, start + i)}>{renderItem(item, start + i)}</React.Fragment>
            ))}
          </div>
        )
      })}
    </div>
  )
}
