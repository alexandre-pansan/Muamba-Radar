import React, { Fragment } from 'react'

/** items: [{ label, onClick? }] — the last item renders as plain text (current page). */
export default function Breadcrumb({ items = [] }) {
  return (
    <nav className="ui-breadcrumb" aria-label="Navegação">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <Fragment key={i}>
            {isLast || !item.onClick ? (
              <span className="ui-breadcrumb-current">{item.label}</span>
            ) : (
              <a href="#" className="ui-breadcrumb-link" onClick={e => { e.preventDefault(); item.onClick() }}>
                {item.label}
              </a>
            )}
            {!isLast && <span className="ui-breadcrumb-sep">/</span>}
          </Fragment>
        )
      })}
    </nav>
  )
}
