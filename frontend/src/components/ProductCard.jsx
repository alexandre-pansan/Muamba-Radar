import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n.jsx'
import { useCart } from '../CartContext.jsx'
import { useFavorites } from '../FavoritesContext.jsx'
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

export default function ProductCard({ group, marginPct, showMargin, idx, onNeedAuth, onReport }) {
  const { t } = useI18n()
  const { savedUrls: cartUrls, toggle: toggleCart } = useCart()
  const { isFavorited, toggle: toggleFavorite } = useFavorites()
  const navigate = useNavigate()
  const [showHint, setShowHint] = useState(false)
  // Foto de site de terceiro pode sumir (404) — cai no placeholder "sem imagem".
  const [imgFailed, setImgFailed] = useState(false)
  const hasImage = Boolean(group.product_image_url) && !imgFailed

  const py     = cheapestByCountry(group.offers, 'py')
  const br     = cheapestByCountry(group.offers, 'br')
  // Real savings, not a fabricated discount badge — % cheaper PY is than the cheapest BR offer.
  const economyPct = (py && br && br.price.amount_brl > 0)
    ? Math.round(((br.price.amount_brl - py.price.amount_brl) / br.price.amount_brl) * 100)
    : null
  const sell   = estimateSellingPrice(py, br, marginPct)
  const margin = (py && sell != null)
    ? Math.round(((sell / py.price.amount_brl) - 1) * 100)
    : null
  const config = buildConfigChip(group)
  const name   = familyDisplayName(group)
  // Real count, not the prototype's curated "X lojas" badge — distinct stores in this group's offers.
  const storeCount = new Set((group.offers || []).map(o => o.store).filter(Boolean)).size

  const cartOffer = py || br
  const isFav = cartOffer ? isFavorited(cartOffer.url) : false
  const isInCart = cartOffer ? cartUrls.has(cartOffer.url) : false

  // Favorites are client-only (no login needed) — see FavoritesContext.jsx.
  function handleHeart(e) {
    e.stopPropagation()
    if (cartOffer) toggleFavorite(cartOffer)
  }

  // Cart is the real, server-backed list — still needs login.
  function handleCartClick(e) {
    e.stopPropagation()
    if (cartOffer) toggleCart(cartOffer, () => setShowHint(true))
  }

  function handleLogin() {
    setShowHint(false)
    onNeedAuth?.()
  }

  function handleViewDetails() {
    if (group.product_key) navigate(`/product/${group.product_key}`, { state: { group } })
  }

  return (
    <div className="product-card-wrap">
      <article
        className="product-card"
        style={{ animationDelay: `${idx * 40}ms`, cursor: group.product_key ? 'pointer' : 'default' }}
        onClick={group.product_key ? handleViewDetails : undefined}
        role={group.product_key ? 'link' : undefined}
        tabIndex={group.product_key ? 0 : undefined}
        onKeyDown={group.product_key ? (e => { if (e.key === 'Enter') handleViewDetails() }) : undefined}
      >
        {/* Real seller highlight — backend Phase 2, only set when a lojista with an
            active plan actually highlighted this exact product (see /compare enrichment). */}
        {group.is_highlighted && (
          <div className="pc-highlight-ribbon">⭐ Destaque</div>
        )}

        {/* Hero image */}
        <div className={`pc-hero${hasImage ? '' : ' no-image'}`}>
          {hasImage && (
            <img src={group.product_image_url} alt={name} loading="lazy" onError={() => setImgFailed(true)} />
          )}

          {storeCount > 1 && (
            <span className="pc-store-count-badge">⭐ {storeCount} lojas</span>
          )}

          {/* Heart button — favorites, client-only, no login needed */}
          <div className="pc-heart-wrap">
            <button
              className={`pc-heart-btn${isFav ? ' is-saved' : ''}`}
              type="button"
              aria-label={isFav ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
              title="Favoritar (salvo neste dispositivo)"
              onClick={handleHeart}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
          </div>

          {economyPct != null && economyPct > 0 && (
            <span className="pc-economy-badge">-{economyPct}%</span>
          )}
        </div>

        {/* Title block */}
        <div className="pc-title-block">
          <h2 className="pc-name">{name}</h2>
          {config && <span className="config-chip">{config}</span>}
        </div>

        <div className="pc-prices-label">Preços de lojas comparadas</div>

        {/* Price rows */}
        <div className="pc-prices">
          <div className={`pc-row pc-row-py${py ? '' : ' is-na'}`}>
            <span className="pc-ctry">PY</span>
            <span className="pc-row-store">{py?.store_info?.name || (py ? sourceDomain(py.url) : '—')}</span>
            <strong className="pc-val">
              {py ? formatMoney(py.price.amount, py.price.currency) : '—'}
            </strong>
          </div>
          {py && (
            <div className="pc-equiv">Equiv. {formatMoney(py.price.amount_brl, 'BRL')}</div>
          )}
          <div className={`pc-row pc-row-br${br ? '' : ' is-na'}`}>
            <span className="pc-ctry">BR</span>
            <span className="pc-row-store">{br?.store_info?.name || (br ? sourceDomain(br.url) : '—')}</span>
            <strong className="pc-val pc-val--br">
              {br ? formatMoney(br.price.amount_brl, 'BRL') : '—'}
            </strong>
          </div>
        </div>

        {/* Real coupon — same enrichment as the highlight ribbon above. */}
        {group.coupon && (
          <div className="pc-coupon-chip" title={`Cupom da loja: ${group.coupon.code}`}>
            🎟️ {group.coupon.code} · {group.coupon.type === 'percent' ? `${group.coupon.value}% OFF` : `US$ ${group.coupon.value} OFF`}
          </div>
        )}

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

          <div className="pc-footer-row">
            <span className="pc-comparisons">
              {group.offers.length} comparaç{group.offers.length !== 1 ? 'ões' : 'ão'}
            </span>
            <button
              className="report-btn"
              type="button"
              aria-label="Reportar dado incorreto"
              title="Reportar dado incorreto"
              onClick={e => { e.stopPropagation(); onReport?.(group, py || br) }}
            >
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 2h10l-2 4 2 4H3V2z"/>
                <line x1="3" y1="14" x2="3" y2="2"/>
              </svg>
            </button>
          </div>

          <div className="pc-cart-btn-wrap">
            <button
              className={`pc-cart-btn${isInCart ? ' is-saved' : ''}`}
              type="button"
              onClick={handleCartClick}
            >
              {isInCart ? '✓ No carrinho' : '+ Carrinho'}
            </button>
            {showHint && (
              <AuthHint onLogin={handleLogin} onClose={() => setShowHint(false)} />
            )}
          </div>
        </div>
      </article>
    </div>
  )
}
