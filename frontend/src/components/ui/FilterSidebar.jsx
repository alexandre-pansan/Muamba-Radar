import React, { useState } from 'react'

/**
 * Barra lateral de filtros da busca (layout do protótipo): grupos de checkbox,
 * fixa à esquerda no desktop; no celular vira tela cheia aberta por um botão flutuante.
 *
 * sections: [{ key, title, options: [{ value, label, count }] }]
 * selected: { [sectionKey]: Set<string> }
 * onToggle: (sectionKey, value) => void
 * onClear: limpa tudo (o link só aparece com algum filtro ativo)
 * resultCount: total já filtrado — vai no botão "Ver N resultados" do celular
 */
export default function FilterSidebar({
  sections = [],
  selected = {},
  onToggle,
  onClear,
  mobileOpen,
  onCloseMobile,
  resultCount,
  className = '',
}) {
  const activeCount = Object.values(selected).reduce((n, set) => n + (set?.size || 0), 0)

  return (
    <aside className={`filter-sidebar${mobileOpen ? ' is-open' : ''} ${className}`.trim()} aria-label="Filtros">
      <div className="filter-sidebar__header">
        <h3>Filtros</h3>
        {activeCount > 0 && onClear && (
          <button type="button" className="filter-sidebar__clear" onClick={onClear}>
            Limpar ({activeCount})
          </button>
        )}
        <button type="button" className="filter-sidebar__close" aria-label="Fechar filtros" onClick={onCloseMobile}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {sections.length === 0 && (
        <p className="filter-sidebar__empty">Sem filtros para estes resultados.</p>
      )}

      {sections.map(section => (
        <FilterGroup key={section.key} section={section} selected={selected[section.key]} onToggle={onToggle} />
      ))}

      <button type="button" className="filter-apply-btn" onClick={onCloseMobile}>
        Ver {resultCount ?? ''} resultado{resultCount === 1 ? '' : 's'}
      </button>
    </aside>
  )
}

// Acima disso o grupo ganha campo de busca e rolagem própria
const SEARCHABLE_MIN = 8

function FilterGroup({ section, selected, onToggle }) {
  const [query, setQuery] = useState('')
  const searchable = section.options.length > SEARCHABLE_MIN
  const needle = query.trim().toLowerCase()
  const isChecked = opt => selected?.has(opt.value) || false
  // marcados ficam no topo — numa lista longa não somem lá embaixo
  const options = section.options
    .filter(opt => !needle || isChecked(opt) || String(opt.label).toLowerCase().includes(needle))
    .sort((a, b) => isChecked(b) - isChecked(a))

  return (
    <div className="filter-group">
      <h4 className="filter-group__title">
        {section.title}
        {searchable && <span className="filter-group__total">{section.options.length}</span>}
      </h4>
      {searchable && (
        <input
          type="search"
          className="filter-group__search"
          placeholder={`Buscar ${section.title.toLowerCase().replace(/\s*\(.*\)$/, '')}...`}
          aria-label={`Buscar em ${section.title}`}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      )}
      <div className={searchable ? 'filter-group__options is-scroll' : 'filter-group__options'}>
        {options.map(opt => {
          const checked = isChecked(opt)
          return (
            <label className={`filter-checkbox${opt.count === 0 && !checked ? ' is-empty' : ''}`} key={opt.value}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle?.(section.key, opt.value)}
              />
              <span className="filter-checkbox__label" title={String(opt.label)}>{opt.label}</span>
              {opt.count != null && <span className="filter-checkbox__count">{opt.count}</span>}
            </label>
          )
        })}
        {options.length === 0 && <p className="filter-group__none">Nada encontrado.</p>}
      </div>
    </div>
  )
}
