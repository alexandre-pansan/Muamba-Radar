import React, { useState, useEffect } from 'react'
import { useI18n } from '../i18n.jsx'
import LoadingScene from './LoadingScene.jsx'
import { detectCategory } from '../loadingTexts.js'
import ProductCard from './ProductCard.jsx'
import {
  sortGroups,
  cheapestByCountry,
  estimateSellingPrice,
  buildConfigChip,
  familyDisplayName,
  formatMoney,
  sourceDomain,
  detectProductType,
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
                <td className="ft-count">{group.offers.length}</td>
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
  onRetry,
  onClear,
  featuredImages,
  onOpenOffers,
}) {
  const { t } = useI18n()
  const [typeFilter, setTypeFilter] = useState(null)

  // Reset filter when results change
  useEffect(() => { setTypeFilter(null) }, [lastQuery])

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

  const displayed = typeFilter
    ? sorted.filter(g => groupType(g) === typeFilter)
    : sorted

  return (
    <div className="content-area">
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
            >
              {t('toolbar.view_card')}
            </button>
            <button
              type="button"
              className={`view-chip${viewMode === 'table' ? ' is-active' : ''}`}
              onClick={() => onViewModeChange('table')}
            >
              {t('toolbar.view_table')}
            </button>
          </div>
        </div>
      </div>

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
              onClick={() => setTypeFilter(t => t === type ? null : type)}
            >
              {type} <span className="type-chip-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {!isLoading && sorted.length > 0 && detectCategory(lastQuery) === 'perfume' && (
        <div className="category-notice">
          <span className="category-notice-icon">🚧</span>
          <div className="category-notice-body">
            <span className="category-notice-title">{t('notice.perfume_title')}</span>
            <span className="category-notice-text">{t('notice.perfume')}</span>
          </div>
        </div>
      )}

      <section className={`results${isLoading ? ' is-loading' : ''}`}>
        {isLoading ? (
          <LoadingScene images={featuredImages} query={lastQuery || ''} />
        ) : viewMode === 'table' && displayed.length > 0 ? (
          <FlatTable
            groups={displayed}
            marginPct={targetMargin}
            t={t}
            onOpenOffers={onOpenOffers}
          />
        ) : viewMode === 'card' && displayed.length > 0 ? (
          <div className="product-grid">
            {displayed.map((group, i) => (
              <ProductCard
                key={group.product_key || i}
                group={group}
                marginPct={targetMargin}
                showMargin={showMargin}
                idx={i}
                onOpenOffers={onOpenOffers}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
