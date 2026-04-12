import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { apiFetchFxRate } from '../api.js'

function UserDropdown({
  currentUser, onOpenSettings, onOpenCalc, onOpenAdmin, onLogout, onClose,
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
    { icon: '💰', label: 'Calculadora de Taxas', action: onOpenCalc },
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

      {/* Theme + Language — always in dropdown */}
      <div className="user-dropdown-divider" />
      <div className="user-dropdown-mobile-extras">
        <button
          className="user-dropdown-item"
          onClick={() => { onToggleTheme(); onClose() }}
        >
          <span className="user-dropdown-item-icon">{theme === 'dark' ? '☀' : '☾'}</span>
          {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        </button>
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
  onOpenAdmin,
  onToggleSidebar,
  theme,
  onToggleTheme,
  onGoHome,
}) {
  const { locale, setLocale, t } = useI18n()
  const [dropdownOpen, setDropdownOpen] = useState(false)
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

        <button
          className="icon-btn theme-toggle-btn"
          type="button"
          aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

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
