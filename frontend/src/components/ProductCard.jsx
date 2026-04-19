import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useI18n } from '../i18n.jsx'
import { useCart } from '../CartContext.jsx'
import { getApiBase } from '../api.js'
import {
  cheapestByCountry,
  estimateSellingPrice,
  buildConfigChip,
  familyDisplayName,
  formatMoney,
  sourceDomain,
} from '../utils.js'

function AuthHint({ onLogin, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="pc-auth-hint" role="dialog" aria-label="Login necessário">
      <button className="pc-auth-hint-close" onClick={onClose} aria-label="Fechar">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div className="pc-auth-hint-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </div>
      <p className="pc-auth-hint-title">Salve produtos na sua lista</p>
      <p className="pc-auth-hint-body">
        Crie uma conta grátis para montar sua lista de compras, comparar preços e saber exatamente onde buscar cada item em Ciudad del Este.
      </p>
      <button className="pc-auth-hint-btn" onClick={onLogin}>
        Entrar ou cadastrar
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h10M9 4l4 4-4 4"/>
        </svg>
      </button>
    </div>
  )
}

function StoreAvatar({ offer }) {
  const info = offer?.store_info
  if (!info?.photo_url) return <span className="pc-store-avatar-gap" />
  const src = info.photo_url.startsWith('/static')
    ? `${getApiBase()}${info.photo_url}`
    : info.photo_url
  return (
    <img
      className="pc-store-avatar"
      src={src}
      alt={info.name}
      title={info.name}
      loading="lazy"
    />
  )
}

export default function ProductCard({ group, marginPct, showMargin, idx, onOpenOffers, onNeedAuth }) {
  const { t } = useI18n()
  const { savedUrls, toggle } = useCart()
  const [showHint, setShowHint] = useState(false)

  const py     = cheapestByCountry(group.offers, 'py')
  const br     = cheapestByCountry(group.offers, 'br')
  const sell   = estimateSellingPrice(py, br, marginPct)
  const margin = (py && sell != null)
    ? Math.round(((sell / py.price.amount_brl) - 1) * 100)
    : null
  const config = buildConfigChip(group)
  const name   = familyDisplayName(group)

  const cartOffer = py || br
  const isSaved = cartOffer ? savedUrls.has(cartOffer.url) : false

  function handleExpand(e) {
    e.stopPropagation()
    onOpenOffers(group, name, config)
  }

  function handleHeart(e) {
    e.stopPropagation()
    if (cartOffer) toggle(cartOffer, () => setShowHint(true))
  }

  function handleLogin() {
    setShowHint(false)
    onNeedAuth?.()
  }

  return (
    <div className="product-card-wrap">
      <article
        className="product-card"
        style={{ animationDelay: `${idx * 40}ms` }}
      >
        {/* Hero image */}
        <div className={`pc-hero${group.product_image_url ? '' : ' no-image'}`}>
          {group.product_image_url && (
            <img src={group.product_image_url} alt={name} loading="lazy" />
          )}

          {/* Heart button */}
          <div className="pc-heart-wrap">
            <button
              className={`pc-heart-btn${isSaved ? ' is-saved' : ''}`}
              type="button"
              aria-label={isSaved ? 'Remover da lista' : 'Salvar na lista'}
              onClick={handleHeart}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
            {showHint && (
              <AuthHint onLogin={handleLogin} onClose={() => setShowHint(false)} />
            )}
          </div>
        </div>

        {/* Title block */}
        <div className="pc-title-block">
          <h2 className="pc-name">{name}</h2>
          {config && <span className="config-chip">{config}</span>}
        </div>

        {/* Price rows */}
        <div className="pc-prices">
          <div className={`pc-row pc-row-py${py ? '' : ' is-na'}`}>
            <StoreAvatar offer={py} />
            <span className="pc-dot py-dot"></span>
            <span className="pc-ctry">PY</span>
            <strong className="pc-val">
              {py ? formatMoney(py.price.amount_brl, 'BRL') : '—'}
            </strong>
            {py && (
              <a className="pc-src" href={py.url} target="_blank" rel="noopener noreferrer">
                {py.store_info?.name || sourceDomain(py.url)}
              </a>
            )}
          </div>
          <div className={`pc-row pc-row-br${br ? '' : ' is-na'}`}>
            <StoreAvatar offer={br} />
            <span className="pc-dot br-dot"></span>
            <span className="pc-ctry">BR</span>
            <strong className="pc-val">
              {br ? formatMoney(br.price.amount_brl, 'BRL') : '—'}
            </strong>
            {br && (
              <a className="pc-src" href={br.url} target="_blank" rel="noopener noreferrer">
                {br.store_info?.name || sourceDomain(br.url)}
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
          <button
            className="expand-btn"
            type="button"
            aria-label={`Ver ${group.offers.length} oferta${group.offers.length !== 1 ? 's' : ''}`}
            onClick={handleExpand}
          >
            &#x25BE; {group.offers.length}
          </button>
        </div>
      </article>
    </div>
  )
}
