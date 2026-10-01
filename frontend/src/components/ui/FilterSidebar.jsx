import React from 'react'

/**
 * Generic checkbox-group filter panel (category/price/store, etc.) for search results.
 * Distinct from the app's existing `Sidebar.jsx`, which is the persistent left-nav/
 * search-controls chrome — this one only appears inside a results toolbar area.
 *
 * sections: [{ key, title, options: [{ value, label }] }]
 * selected: { [sectionKey]: Set<string> }
 * onToggle: (sectionKey, value) => void
 */
export default function FilterSidebar({ sections = [], selected = {}, onToggle, onApply, mobileOpen, onCloseMobile, className = '' }) {
  return (
    <aside className={`ui-filter-sidebar${mobileOpen ? ' is-open' : ''} ${className}`.trim()}>
      <div className="ui-filter-sidebar-header">
        <h3>Filtros</h3>
        <button type="button" className="ui-filter-sidebar-close" aria-label="Fechar filtros" onClick={onCloseMobile}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {sections.map(section => (
        <div className="ui-filter-group" key={section.key}>
          <h4 className="ui-filter-group-title">{section.title}</h4>
          {section.options.map(opt => (
            <label className="ui-filter-checkbox" key={opt.value}>
              <input
                type="checkbox"
                checked={selected[section.key]?.has(opt.value) || false}
                onChange={() => onToggle?.(section.key, opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      ))}

      {onApply && (
        <button type="button" className="ui-btn ui-btn--primary ui-filter-apply-btn" onClick={onApply}>
          Aplicar Filtros
        </button>
      )}
    </aside>
  )
}
