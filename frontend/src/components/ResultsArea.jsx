import React, { useState, useEffect } from 'react'
import { useI18n } from '../i18n.jsx'
import LoadingScene from './LoadingScene.jsx'
import { detectCategory } from '../loadingTexts.js'
import ProductCard from './ProductCard.jsx'
import { Breadcrumb, FilterSidebar } from './ui/index.js'
import {
  sortGroups,
  cheapestByCountry,
  estimateSellingPrice,
  buildConfigChip,
  familyDisplayName,
  formatMoney,
  sourceDomain,
  detectProductType,
  detectVariant,
  extractBundleGame,
} from '../utils.js'

function FlatTable({ groups, marginPct, t, onOpenOffers }) {
  return (
    <div className="flat-table-wrap">
      <table className="flat-table">
        <thead>
          <tr>
            <th>{t('table.model')}</th>
            <th>{t('table.config')}</th>
            <th>{t('table.py_price')}</th>
            <th>{t('table.py_source')}</th>
            <th>{t('table.br_market')}</th>
            <th>{t('table.br_source')}</th>
            <th>{t('table.est_sell')}</th>
            <th>{t('table.margin')}</th>
            <th>{t('table.offers')}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, i) => {
            const py     = cheapestByCountry(group.offers, 'py')
            const br     = cheapestByCountry(group.offers, 'br')
            const sell   = estimateSellingPrice(py, br, marginPct)
            const margin = (py && sell != null)
              ? Math.round(((sell / py.price.amount_brl) - 1) * 100)
              : null
            const config = buildConfigChip(group) || '—'
            const name   = familyDisplayName(group)

            return (
              <tr key={group.product_key || i} style={{ animationDelay: `${i * 20}ms` }}>
                <td className="ft-model">{name}</td>
                <td><span className="config-chip">{config}</span></td>
                <td className="ft-py">{py ? formatMoney(py.price.amount_brl, 'BRL') : '—'}</td>
                <td>
                  {py
                    ? <a className="ft-link" href={py.url} target="_blank" rel="noopener noreferrer">{sourceDomain(py.url)}</a>
                    : '—'}
                </td>
                <td className="ft-br">{br ? formatMoney(br.price.amount_brl, 'BRL') : '—'}</td>
                <td>
                  {br
                    ? <a className="ft-link" href={br.url} target="_blank" rel="noopener noreferrer">{sourceDomain(br.url)}</a>
                    : '—'}
                </td>
                <td><strong className="ft-sell">{sell != null ? formatMoney(sell, 'BRL') : '—'}</strong></td>
                <td>{margin != null ? <span className="margin-tag">+{margin}%</span> : '—'}</td>
                <td className="ft-count">
                  <button
                    className="ft-offers-btn"
                    type="button"
                    onClick={() => onOpenOffers(group, name, config)}
                    aria-label={`Ver ${group.offers.length} oferta${group.offers.length !== 1 ? 's' : ''} de ${name}`}
                  >
                    {group.offers.length}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ResultsArea({
  isLoading,
  lastData,
  lastQuery,
  status,
  isStale,
  viewMode,
  onViewModeChange,
  groupOrder,
  onGroupOrderChange,
  targetMargin,
  showMargin,
  onMarginChange,
  onRetry,
  onClear,
  featuredImages,
  onOpenOffers,
  onNeedAuth,
  onReport,
  scrollRef,
}) {
  const { t } = useI18n()
  const [marginPickerOpen, setMarginPickerOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState(null)
  const [concFilter, setConcFilter] = useState(null)
  const [variantFilter, setVariantFilter] = useState(null)
  const [gameFilter, setGameFilter] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [checkboxFilters, setCheckboxFilters] = useState({ price: new Set(), store: new Set() })

  // Reset filters when results change
  useEffect(() => {
    setTypeFilter(null); setConcFilter(null); setVariantFilter(null); setGameFilter(null); setFiltersOpen(false)
    setDrawerOpen(false); setCheckboxFilters({ price: new Set(), store: new Set() })
  }, [lastQuery])

  function toggleCheckboxFilter(sectionKey, value) {
    setCheckboxFilters(prev => {
      const next = new Set(prev[sectionKey])
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return { ...prev, [sectionKey]: next }
    })
  }
  // Reset game filter when variant filter changes
  useEffect(() => { setGameFilter(null) }, [variantFilter])

  const showClear = Boolean(lastData)
  const showRetry = status?.isError && lastQuery != null

  const sorted = lastData?.groups
    ? sortGroups(lastData.groups, groupOrder, targetMargin)
    : []

  function groupType(g) {
    const candidates = [
      familyDisplayName(g),
      g.canonical_name,
      ...(g.offers || []).map(o => o.title).filter(Boolean),
    ]
    return candidates.reduce((found, name) => found || detectProductType(name), null)
  }

  // Detect types present in results — check canonical name + raw offer titles
  const typeMap = {}
  sorted.forEach(g => {
    const type = groupType(g)
    if (type) typeMap[type] = (typeMap[type] || 0) + 1
  })
  const types = Object.entries(typeMap).sort((a, b) => b[1] - a[1])
  const showTypeFilter = types.length >= 1
  const activeFilterCount = [typeFilter, concFilter, variantFilter, gameFilter].filter(Boolean).length
  const hasAnyFilter = showTypeFilter

  const typeFiltered = typeFilter
    ? sorted.filter(g => groupType(g) === typeFilter)
    : sorted

  // Concentration sub-filter (perfumes only)
  const concMap = {}
  typeFiltered.forEach(g => {
    if (g.concentration) concMap[g.concentration] = (concMap[g.concentration] || 0) + 1
  })
  const concentrations = Object.entries(concMap).sort((a, b) => b[1] - a[1])
  const showConcFilter = concentrations.length >= 2

  const concFiltered = concFilter
    ? typeFiltered.filter(g => g.concentration === concFilter)
    : typeFiltered

  // Variant sub-filter (editions, Pro/Slim/Digital/etc.)
  function groupVariant(g) {
    const fk = g.family_key || ''
    // Use family_key directly for backend-set console modifiers (most specific first)
    if (fk.includes('_bundle')) return 'Bundle'
    if (fk.includes('_digital')) return 'Digital'
    // Fall back to name-based detection for other variants (Slim, Pro, OLED, etc.)
    const candidates = [
      familyDisplayName(g),
      ...(g.offers || []).map(o => o.title).filter(Boolean),
    ]
    for (const name of candidates) {
      const v = detectVariant(name)
      if (v) return v
    }
    return null
  }

  const variantMap = {}
  concFiltered.forEach(g => {
    const v = groupVariant(g)
    if (v) variantMap[v] = (variantMap[v] || 0) + 1
  })
  const variants = Object.entries(variantMap).sort((a, b) => b[1] - a[1])
  const showVariantFilter = variants.length >= 2

  const variantFiltered = variantFilter
    ? concFiltered.filter(g => groupVariant(g) === variantFilter)
    : concFiltered

  // Game sub-filter — shown when Bundle variant is active
  const showGameFilter = variantFilter === 'Bundle'
  const gameMap = {}
  if (showGameFilter) {
    variantFiltered.forEach(g => {
      const titles = (g.offers || []).map(o => o.title).filter(Boolean)
      const game = titles.reduce((found, t) => found || extractBundleGame(t), null)
      if (game) gameMap[game] = (gameMap[game] || 0) + 1
    })
  }
  const games = Object.entries(gameMap).sort((a, b) => b[1] - a[1])

  const displayed = gameFilter
    ? variantFiltered.filter(g => {
        const titles = (g.offers || []).map(o => o.title).filter(Boolean)
        return titles.some(t => extractBundleGame(t) === gameFilter)
      })
    : variantFiltered

  // ── Checkbox drawer filters: price range + store (real facets computed from
  // `displayed`, not the prototype's fabricated ones — see ui/FilterSidebar) ──
  const PRICE_BUCKETS = [
    { value: '0-500', label: 'Até R$500', test: v => v <= 500 },
    { value: '500-2000', label: 'R$500 – R$2.000', test: v => v > 500 && v <= 2000 },
    { value: '2000-5000', label: 'R$2.000 – R$5.000', test: v => v > 2000 && v <= 5000 },
    { value: '5000-10000', label: 'R$5.000 – R$10.000', test: v => v > 5000 && v <= 10000 },
    { value: '10000-Infinity', label: 'Acima de R$10.000', test: v => v > 10000 },
  ]

  function groupCheapestBRL(g) {
    const py = cheapestByCountry(g.offers, 'py')
    const br = cheapestByCountry(g.offers, 'br')
    const prices = [py?.price?.amount_brl, br?.price?.amount_brl].filter(v => v != null)
    return prices.length ? Math.min(...prices) : null
  }

  function groupStores(g) {
    return [...new Set((g.offers || []).map(o => o.store).filter(Boolean))]
  }

  const priceOptions = PRICE_BUCKETS
    .map(b => ({ ...b, count: displayed.filter(g => { const p = groupCheapestBRL(g); return p != null && b.test(p) }).length }))
    .filter(b => b.count > 0)
    .map(b => ({ value: b.value, label: `${b.label} (${b.count})` }))

  const storeMap = {}
  displayed.forEach(g => groupStores(g).forEach(s => { storeMap[s] = (storeMap[s] || 0) + 1 }))
  const storeOptions = Object.entries(storeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([s, c]) => ({ value: s, label: `${s} (${c})` }))

  const activeDrawerCount = checkboxFilters.price.size + checkboxFilters.store.size
  const hasDrawerFacets = priceOptions.length > 0 || storeOptions.length > 0

  const finalDisplayed = displayed.filter(g => {
    if (checkboxFilters.price.size > 0) {
      const p = groupCheapestBRL(g)
      const bucket = PRICE_BUCKETS.find(b => p != null && b.test(p))
      if (!bucket || !checkboxFilters.price.has(bucket.value)) return false
    }
    if (checkboxFilters.store.size > 0) {
      const stores = groupStores(g)
      if (!stores.some(s => checkboxFilters.store.has(s))) return false
    }
    return true
  })

  return (
    <div className="content-area">
      {drawerOpen && <div className="ui-filter-drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
      <FilterSidebar
        className="ui-filter-sidebar--drawer"
        mobileOpen={drawerOpen}
        onCloseMobile={() => setDrawerOpen(false)}
        sections={[
          ...(priceOptions.length > 0 ? [{ key: 'price', title: 'Faixa de Preço', options: priceOptions }] : []),
          ...(storeOptions.length > 0 ? [{ key: 'store', title: 'Loja', options: storeOptions }] : []),
        ]}
        selected={checkboxFilters}
        onToggle={toggleCheckboxFilter}
      />
      {lastQuery && (
        <Breadcrumb items={[
          { label: 'Início', onClick: onClear },
          { label: `Resultados para "${lastQuery}"` },
        ]} />
      )}
      <div className="content-toolbar">
        <div className="toolbar-left">
          <p className={`status${status?.isError ? ' error' : ''}`}>
            {status?.text ?? t('status.ready')}
          </p>
          {isStale && (
            <span className="badge-stale">{t('status.stale')}</span>
          )}
          {showRetry && (
            <button className="btn-inline" onClick={onRetry}>{t('btn.retry')}</button>
          )}
          {showClear && (
            <button className="btn-inline btn-muted" onClick={onClear}>{t('btn.clear')}</button>
          )}
        </div>
        <div className="toolbar-right">
          {showMargin && onMarginChange && (
            <div className="margin-picker-wrap">
              <button
                type="button"
                className={`drawer-toggle-btn${marginPickerOpen ? ' has-active' : ''}`}
                onClick={() => setMarginPickerOpen(o => !o)}
              >
                {t('sidebar.margin_title')}: {targetMargin}%
              </button>
              {marginPickerOpen && (
                <div className="margin-picker-popover">
                  {[10, 20, 30, 35, 40, 45, 50].map(m => (
                    <button
                      key={m}
                      type="button"
                      className={`margin-chip${targetMargin === m ? ' is-active' : ''}`}
                      onClick={() => { onMarginChange(m); setMarginPickerOpen(false) }}
                    >
                      {m}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="toolbar-group">
            <label className="toolbar-label" htmlFor="groupOrderSelect">{t('toolbar.order_label')}</label>
            <select
              id="groupOrderSelect"
              className="toolbar-select"
              value={groupOrder}
              onChange={e => onGroupOrderChange(e.target.value)}
            >
              <option value="default">Relevância</option>
              <option value="estimated_asc">Venda ↑ Menor</option>
              <option value="estimated_desc">Venda ↓ Maior</option>
              <option value="py_asc">PY ↑ Menor</option>
              <option value="py_desc">PY ↓ Maior</option>
              <option value="name_asc">Nome A→Z</option>
              <option value="name_desc">Nome Z→A</option>
            </select>
          </div>
          <div className="view-switch">
            <button
              type="button"
              className={`view-chip${viewMode === 'card' ? ' is-active' : ''}`}
              onClick={() => onViewModeChange('card')}
              aria-label={t('toolbar.view_card')}
              title={t('toolbar.view_card')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
            <button
              type="button"
              className={`view-chip${viewMode === 'table' ? ' is-active' : ''}`}
              onClick={() => onViewModeChange('table')}
              aria-label={t('toolbar.view_table')}
              title={t('toolbar.view_table')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
          {!isLoading && hasAnyFilter && (
            <button
              type="button"
              className={`filter-toggle-btn${filtersOpen ? ' is-open' : ''}${activeFilterCount > 0 ? ' has-active' : ''}`}
              onClick={() => setFiltersOpen(o => !o)}
              aria-label="Filtros"
            >
              ⊞{activeFilterCount > 0 && <span className="filter-toggle-badge">{activeFilterCount}</span>}
            </button>
          )}
          {!isLoading && hasDrawerFacets && (
            <button
              type="button"
              className={`drawer-toggle-btn${activeDrawerCount > 0 ? ' has-active' : ''}`}
              onClick={() => setDrawerOpen(true)}
              aria-label="Filtros de preço e loja"
              title="Filtros de preço e loja"
            >
              Filtros{activeDrawerCount > 0 && <span className="filter-toggle-badge">{activeDrawerCount}</span>}
            </button>
          )}
        </div>
      </div>

      <div className={`filter-bars-panel${filtersOpen ? ' is-open' : ''}`}>
      {!isLoading && showTypeFilter && (
        <div className="type-filter-bar">
          <button
            className={`type-chip${!typeFilter ? ' is-active' : ''}`}
            onClick={() => setTypeFilter(null)}
          >
            Todos <span className="type-chip-count">{sorted.length}</span>
          </button>
          {types.map(([type, count]) => (
            <button
              key={type}
              className={`type-chip${typeFilter === type ? ' is-active' : ''}`}
              onClick={() => { setTypeFilter(t => t === type ? null : type); setConcFilter(null); setVariantFilter(null) }}
            >
              {type} <span className="type-chip-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {!isLoading && showConcFilter && (
        <div className="type-filter-bar type-filter-bar--sub">
          <button
            className={`type-chip${!concFilter ? ' is-active' : ''}`}
            onClick={() => setConcFilter(null)}
          >
            Todos <span className="type-chip-count">{typeFiltered.length}</span>
          </button>
          {concentrations.map(([conc, count]) => (
            <button
              key={conc}
              className={`type-chip${concFilter === conc ? ' is-active' : ''}`}
              onClick={() => { setConcFilter(c => c === conc ? null : conc); setVariantFilter(null) }}
            >
              {conc} <span className="type-chip-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {!isLoading && showVariantFilter && (
        <div className="type-filter-bar type-filter-bar--sub">
          <button
            className={`type-chip${!variantFilter ? ' is-active' : ''}`}
            onClick={() => setVariantFilter(null)}
          >
            Todos <span className="type-chip-count">{concFiltered.length}</span>
          </button>
          {variants.map(([variant, count]) => (
            <button
              key={variant}
              className={`type-chip${variantFilter === variant ? ' is-active' : ''}`}
              onClick={() => setVariantFilter(v => v === variant ? null : variant)}
            >
              {variant} <span className="type-chip-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {!isLoading && showGameFilter && games.length >= 1 && (
        <div className="type-filter-bar type-filter-bar--sub">
          <span className="filter-bar-label">Jogo:</span>
          <button
            className={`type-chip${!gameFilter ? ' is-active' : ''}`}
            onClick={() => setGameFilter(null)}
          >
            Todos <span className="type-chip-count">{variantFiltered.length}</span>
          </button>
          {games.map(([game, count]) => (
            <button
              key={game}
              className={`type-chip${gameFilter === game ? ' is-active' : ''}`}
              onClick={() => setGameFilter(g => g === game ? null : game)}
            >
              {game} <span className="type-chip-count">{count}</span>
            </button>
          ))}
        </div>
      )}
      </div>

      {!isLoading && sorted.length > 0 && detectCategory(lastQuery) === 'perfume' && (
        <div className="category-notice">
          <span className="category-notice-icon">🚧</span>
          <div className="category-notice-body">
            <span className="category-notice-title">{t('notice.perfume_title')}</span>
            <span className="category-notice-text">{t('notice.perfume')}</span>
          </div>
        </div>
      )}

      <section ref={scrollRef} className={`results${isLoading ? ' is-loading' : ''}`}>
        {isLoading ? (
          <LoadingScene images={featuredImages} query={lastQuery || ''} />
        ) : viewMode === 'table' && finalDisplayed.length > 0 ? (
          <FlatTable
            groups={finalDisplayed}
            marginPct={targetMargin}
            t={t}
            onOpenOffers={onOpenOffers}
          />
        ) : viewMode === 'card' && finalDisplayed.length > 0 ? (
          <div className="product-grid">
            {finalDisplayed.map((group, i) => (
              <ProductCard
                key={group.product_key || i}
                group={group}
                marginPct={targetMargin}
                showMargin={showMargin}
                idx={i}
                onOpenOffers={onOpenOffers}
                onNeedAuth={onNeedAuth}
                onReport={onReport}
              />
            ))}
          </div>
        ) : !isLoading && finalDisplayed.length === 0 && lastData != null ? (
          <div className="empty-state">
            <p>Nenhum produto encontrado{displayed.length > 0 ? ' com esses filtros' : ` para "${lastQuery}"`}.</p>
            <p className="empty-state-hint">
              {displayed.length > 0 ? 'Tente remover algum filtro.' : 'Tente buscar por marca, modelo ou tipo de produto.'}
            </p>
            <button type="button" onClick={displayed.length > 0 ? () => setCheckboxFilters({ price: new Set(), store: new Set() }) : onClear}>
              {displayed.length > 0 ? 'Limpar filtros' : 'Limpar busca'}
            </button>
          </div>
        ) : null}
      </section>

      {!isLoading && finalDisplayed.length > 0 && (() => {
        const allOffers = finalDisplayed.flatMap(g => g.offers || [])
        const oldestCapture = allOffers.reduce((oldest, o) => {
          if (!o.captured_at) return oldest
          return !oldest || o.captured_at < oldest ? o.captured_at : oldest
        }, null)
        const pyOffer = allOffers.find(o => o.country === 'py' && o.price?.fx_rate_used)
        const fxRate = pyOffer?.price?.fx_rate_used
        const capturedDate = oldestCapture
          ? new Date(oldestCapture).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
          : null
        return (
          <p className="results-capture-info">
            {capturedDate && <>Capturado em {capturedDate}</>}
            {capturedDate && fxRate && <span className="results-capture-sep"> · </span>}
            {fxRate && (
              <span title="Os preços paraguaios são convertidos para BRL usando essa cotação estimada. Confirme o valor final na loja.">
                Câmbio PY estimado: R$&nbsp;1&nbsp;≈&nbsp;Gs&nbsp;{Math.round(fxRate).toLocaleString('pt-BR')} ⓘ
              </span>
            )}
          </p>
        )
      })()}
    </div>
  )
}
