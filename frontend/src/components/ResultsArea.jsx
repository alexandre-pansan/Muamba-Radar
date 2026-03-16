import React from 'react'
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

  const showClear = Boolean(lastData)
  const showRetry = status?.isError && lastQuery != null

  const sorted = lastData?.groups
    ? sortGroups(lastData.groups, groupOrder, targetMargin)
    : []

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
              <option value="estimated_asc">{t('toolbar.order_sell_asc')}</option>
              <option value="estimated_desc">{t('toolbar.order_sell_desc')}</option>
              <option value="default">{t('toolbar.order_best')}</option>
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

      {(() => {
        if (isLoading || sorted.length < 3) return null
        const missingBr = sorted.filter(g => !g.offers.some(o => o.country === 'br')).length
        if (missingBr / sorted.length < 0.5) return null
        return (
          <div className="category-notice">
            <span className="category-notice-icon">🚧</span>
            <div className="category-notice-body">
              <span className="category-notice-title">{t('notice.perfume_title')}</span>
              <span className="category-notice-text">{t('notice.perfume')}</span>
            </div>
          </div>
        )
      })()}

      <section className={`results${isLoading ? ' is-loading' : ''}`}>
        {isLoading ? (
          <LoadingScene images={featuredImages} query={lastQuery || ''} />
        ) : viewMode === 'table' && sorted.length > 0 ? (
          <FlatTable
            groups={sorted}
            marginPct={targetMargin}
            t={t}
            onOpenOffers={onOpenOffers}
          />
        ) : viewMode === 'card' && sorted.length > 0 ? (
          <div className="product-grid">
            {sorted.map((group, i) => (
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
