import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { apiFetchFxRate } from '../api.js'
import { useCart } from '../CartContext.jsx'

function CartDropdown({ onOpenCart, onClose, currentUser, onOpenAuth, fxRate }) {
  const ref = useRef(null)
  const { items, remove, loading } = useCart()

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Group items by store
  const groups = items.reduce((acc, item) => {
    if (!acc[item.store_name]) acc[item.store_name] = []
    acc[item.store_name].push(item)
    return acc
  }, {})
  const groupKeys = Object.keys(groups)

  function formatPrice(amount, currency) {
    if (currency === 'PYG') return `G$ ${Math.round(amount).toLocaleString('pt-BR')}`
    if (currency === 'USD') return `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function cartTotals(items) {
    const totals = {}
    for (const i of items) totals[i.price_currency] = (totals[i.price_currency] || 0) + i.price_amount
    const usd = totals['USD'] ? formatPrice(totals['USD'], 'USD') : null
    const brl = totals['BRL']
      ? formatPrice(totals['BRL'], 'BRL')
      : (fxRate && totals['USD'])
        ? `R$ ${(totals['USD'] * fxRate).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null
    return { usd, brl }
  }

  return (
    <div ref={ref} className="cart-dropdown" role="dialog" aria-label="Prévia do carrinho">
      <div className="cart-dropdown-header">
        <span className="cart-dropdown-title">Lista de compras</span>
        {items.length > 0 && (
          <span className="cart-dropdown-count">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
        )}
      </div>

      {!currentUser ? (
        <div className="cart-dropdown-auth">
          <p className="cart-dropdown-hint">Faça login para salvar produtos na sua lista.</p>
          <button
            className="cart-dropdown-login-btn"
            onClick={() => { onOpenAuth('login'); onClose() }}
          >
            Entrar
          </button>
        </div>
      ) : loading ? (
        <div className="cart-dropdown-empty">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="cart-dropdown-empty">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="cart-dropdown-empty-icon" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <p>Sua lista está vazia.</p>
          <p className="cart-dropdown-hint">Clique no ❤ de um produto para salvar.</p>
        </div>
      ) : (
        <div className="cart-dropdown-body">
          {groupKeys.slice(0, 4).map(storeName => {
            const storeItems = groups[storeName]
            const preview = storeItems.slice(0, 3)
            const extra = storeItems.length - preview.length
            return (
              <div key={storeName} className="cart-dd-group">
                <div className="cart-dd-store">{storeName}</div>
                {preview.map(item => (
                  <div key={item.id} className="cart-dd-item">
                    {item.image_url && (
                      <img className="cart-dd-img" src={item.image_url} alt={item.title} loading="lazy" />
                    )}
                    <span className="cart-dd-title" title={item.title}>
                      {item.title.length > 38 ? item.title.slice(0, 38) + '…' : item.title}
                    </span>
                    <span className="cart-dd-price">{formatPrice(item.price_amount, item.price_currency)}</span>
                    <button
                      className="cart-dd-remove"
                      onClick={() => remove(item.id)}
                      aria-label="Remover"
                      title="Remover"
                    >×</button>
                  </div>
                ))}
                {extra > 0 && (
                  <p className="cart-dd-extra">+{extra} item{extra !== 1 ? 's' : ''} nessa loja</p>
                )}
              </div>
            )
          })}
          {groupKeys.length > 4 && (
            <p className="cart-dd-more-stores">+{groupKeys.length - 4} lojas não exibidas</p>
          )}
        </div>
      )}

      {currentUser && items.length > 0 && (
        <div className="cart-dropdown-footer">
          <div className="cart-dd-total">
            <span className="cart-dd-total-label">Total estimado</span>
            <div className="cart-dd-total-values">
              {cartTotals(items).brl && <span className="cart-dd-total-brl">{cartTotals(items).brl}</span>}
              {cartTotals(items).usd && <span className="cart-dd-total-usd">{cartTotals(items).usd}</span>}
            </div>
          </div>
          <button
            className="cart-dropdown-cta"
            onClick={() => { onOpenCart(); onClose() }}
          >
            Ver lista completa
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function UserDropdown({
  currentUser, onOpenSettings, onOpenCalc, onOpenImportCalc, onOpenAdmin, onLogout, onClose,
  theme, onToggleTheme, locale, setLocale,
}) {
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const items = [
    { icon: '⚙', label: 'Configurações', action: onOpenSettings },
    { icon: '💰', label: 'Calculadora de Taxas MP', action: onOpenCalc },
    { icon: '🧾', label: 'Calculadora de Declaração', action: onOpenImportCalc },
    ...(currentUser?.is_admin ? [{ icon: '🔧', label: 'Dev Tools', action: onOpenAdmin }] : []),
    { divider: true },
    { icon: '↩', label: 'Sair', action: onLogout, danger: true },
  ]

  return (
    <div ref={ref} className="user-dropdown">
      <div className="user-dropdown-header">
        <div className="user-dropdown-name">{currentUser.name || currentUser.email}</div>
        <div className="user-dropdown-email">{currentUser.email}</div>
      </div>
      <div className="user-dropdown-divider" />

      {items.map((item, i) => item.divider
        ? <div key={i} className="user-dropdown-divider" />
        : (
          <button
            key={i}
            className={`user-dropdown-item${item.danger ? ' danger' : ''}`}
            onClick={() => { item.action(); onClose() }}
          >
            <span className="user-dropdown-item-icon">{item.icon}</span>
            {item.label}
          </button>
        )
      )}

      {/* Language — always in dropdown */}
      <div className="user-dropdown-divider" />
      <div className="user-dropdown-mobile-extras">
        <div className="dropdown-lang-row">
          {['en', 'pt', 'es'].map(lang => (
            <button
              key={lang}
              className={`dropdown-lang-btn${locale === lang ? ' is-active' : ''}`}
              onClick={() => { setLocale(lang); onClose() }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Header({
  currentUser,
  onOpenAuth,
  onLogout,
  onOpenSettings,
  onOpenCalc,
  onOpenImportCalc,
  onOpenAdmin,
  onOpenCart,
  cartCount = 0,
  onToggleSidebar,
  theme,
  onToggleTheme,
  onGoHome,
}) {
  const { locale, setLocale, t } = useI18n()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [cartDropdownOpen, setCartDropdownOpen] = useState(false)
  const [fxRate, setFxRate] = useState(null)

  useEffect(() => {
    apiFetchFxRate().then(rate => { if (rate) setFxRate(rate) })
  }, [])

  return (
    <header className="topbar">
      <button
        className="icon-btn sidebar-toggle"
        type="button"
        aria-label="Menu"
        onClick={onToggleSidebar}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
          <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd"/>
        </svg>
      </button>

      <a className="topbar-brand" href="/" aria-label="MuambaRadar — início"
        onClick={onGoHome ? (e) => { e.preventDefault(); onGoHome() } : undefined}
      >
        {/* Full logo on desktop, compact icon on mobile */}
        <img src="/logo_text.png" alt="MuambaRadar" className="topbar-logo topbar-logo-full" />
        <img src="/logo.png"      alt="MuambaRadar" className="topbar-logo topbar-logo-compact" />
      </a>

      <div className="topbar-right">
        {fxRate && (
          <span className="topbar-fx-rate" title="Cotação USD → BRL (comprasparaguai.com.br)">
            <span className="topbar-fx-label">Cotação do dólar:</span>
            <span className="topbar-fx-value">R$ {fxRate.toFixed(2)}</span>
          </span>
        )}

        {/* Import duty calculator button */}
        <button
          className="icon-btn"
          type="button"
          aria-label="Calculadora de Declaração"
          title="Calculadora de Declaração"
          onClick={onOpenImportCalc}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="2" width="16" height="20" rx="2"/>
            <line x1="8" y1="6" x2="16" y2="6"/>
            <line x1="8" y1="10" x2="10" y2="10"/>
            <line x1="14" y1="10" x2="16" y2="10"/>
            <line x1="8" y1="14" x2="10" y2="14"/>
            <line x1="14" y1="14" x2="16" y2="14"/>
            <line x1="8" y1="18" x2="10" y2="18"/>
            <line x1="14" y1="18" x2="16" y2="18"/>
          </svg>
        </button>

        {/* Cart button — opens dropdown preview */}
        <div className="cart-menu-wrap">
          <button
            className={`icon-btn header-cart-btn${cartDropdownOpen ? ' is-active' : ''}`}
            type="button"
            aria-label="Lista de compras"
            aria-expanded={cartDropdownOpen}
            aria-haspopup="dialog"
            onClick={() => { setCartDropdownOpen(o => !o); setDropdownOpen(false) }}
            title="Lista de compras"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            {cartCount > 0 && (
              <span className="cart-badge" aria-label={`${cartCount} itens`}>
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
          {cartDropdownOpen && (
            <CartDropdown
              onOpenCart={onOpenCart}
              onClose={() => setCartDropdownOpen(false)}
              currentUser={currentUser}
              onOpenAuth={onOpenAuth}
              fxRate={fxRate}
            />
          )}
        </div>


        <div className="auth-bar">
          {currentUser ? (
            <div className="user-menu-wrap">
              <button
                className="user-menu-trigger"
                type="button"
                aria-expanded={dropdownOpen}
                aria-haspopup="menu"
                onClick={() => setDropdownOpen(o => !o)}
              >
                <span className="user-menu-avatar">
                  {(currentUser.name || currentUser.email)[0].toUpperCase()}
                </span>
                <span className="user-menu-name">
                  {t('auth.greeting')} <strong>{currentUser.name || currentUser.email}</strong>
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </svg>
              </button>

              {dropdownOpen && (
                <UserDropdown
                  currentUser={currentUser}
                  onOpenSettings={onOpenSettings}
                  onOpenCalc={onOpenCalc}
                  onOpenImportCalc={onOpenImportCalc}
                  onOpenAdmin={onOpenAdmin}
                  onLogout={onLogout}
                  onClose={() => setDropdownOpen(false)}
                  theme={theme}
                  onToggleTheme={onToggleTheme}
                  locale={locale}
                  setLocale={setLocale}
                />
              )}
            </div>
          ) : (
            <button className="btn-inline" type="button" onClick={() => onOpenAuth('login')}>
              {t('auth.login_register')}
            </button>
          )}
        </div>

      </div>
    </header>
  )
}
