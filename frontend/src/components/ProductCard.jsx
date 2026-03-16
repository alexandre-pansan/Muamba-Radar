import React from 'react'
import { useI18n } from '../i18n.jsx'
import {
  cheapestByCountry,
  estimateSellingPrice,
  buildConfigChip,
  familyDisplayName,
  formatMoney,
  sourceDomain,
} from '../utils.js'

export default function ProductCard({ group, marginPct, showMargin, idx, onOpenOffers }) {
  const { t } = useI18n()

  const py     = cheapestByCountry(group.offers, 'py')
  const br     = cheapestByCountry(group.offers, 'br')
  const sell   = estimateSellingPrice(py, br, marginPct)
  const margin = (py && sell != null)
    ? Math.round(((sell / py.price.amount_brl) - 1) * 100)
    : null
  const config = buildConfigChip(group)
  const name   = familyDisplayName(group)

  function handleExpand(e) {
    e.stopPropagation()
    onOpenOffers(group, name, config)
  }

  return (
    <div className="product-card-wrap">
      <article
        className="product-card"
        style={{ animationDelay: `${idx * 40}ms` }}
      >
        {/* Image */}
        <div className={`pc-img${group.product_image_url ? '' : ' no-image'}`}>
          {group.product_image_url && (
            <img src={group.product_image_url} alt={name} loading="lazy" />
          )}
        </div>

        {/* Title block */}
        <div className="pc-title-block">
          <h2 className="pc-name">{name}</h2>
          {config && <span className="config-chip">{config}</span>}
        </div>

        {/* Price rows */}
        <div className="pc-prices">
          <div className={`pc-row pc-row-py${py ? '' : ' is-na'}`}>
            <span className="pc-dot py-dot"></span>
            <span className="pc-ctry">PY</span>
            <strong className="pc-val">
              {py ? formatMoney(py.price.amount_brl, 'BRL') : '—'}
            </strong>
            {py && (
              <a className="pc-src" href={py.url} target="_blank" rel="noopener noreferrer">
                {sourceDomain(py.url)}
              </a>
            )}
          </div>
          <div className={`pc-row pc-row-br${br ? '' : ' is-na'}`}>
            <span className="pc-dot br-dot"></span>
            <span className="pc-ctry">BR</span>
            <strong className="pc-val">
              {br ? formatMoney(br.price.amount_brl, 'BRL') : '—'}
            </strong>
            {br && (
              <a className="pc-src" href={br.url} target="_blank" rel="noopener noreferrer">
                {sourceDomain(br.url)}
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pc-footer">
          {showMargin && (
            <div className="pc-sell">
              <span className="pc-sell-lbl">{t('card.est_sell_short')}</span>
              <strong className="pc-sell-val">
                {sell != null ? formatMoney(sell, 'BRL') : '—'}
              </strong>
              {margin != null && (
                <span className="margin-tag">+{margin}%</span>
              )}
            </div>
          )}
          <button className="expand-btn" type="button" onClick={handleExpand}>
            &#x25BE; {group.offers.length}
          </button>
        </div>
      </article>
    </div>
  )
}
