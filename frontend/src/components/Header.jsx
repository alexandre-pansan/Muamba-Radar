import React from 'react'
import { useI18n } from '../i18n.jsx'

export default function Header({
  currentUser,
  onOpenAuth,
  onLogout,
  onOpenSettings,
  onOpenAdmin,
  onToggleSidebar,
  theme,
  onToggleTheme,
}) {
  const { locale, setLocale, t } = useI18n()

  const display = currentUser ? (currentUser.name || currentUser.email) : null

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

      <a className="topbar-brand" href="/" aria-label="MuambaRadar — início">
        <img
          src="/logo_text.png"
          alt="MuambaRadar"
          className="topbar-logo"
        />
      </a>

      <div className="topbar-right">
        <div className="auth-bar">
          {currentUser ? (
            <>
              <span className="auth-greeting">
                {t('auth.greeting')} <strong>{display}</strong>
              </span>
              {currentUser.is_admin && (
                <button
                  className="btn-inline admin-link"
                  type="button"
                  onClick={onOpenAdmin}
                >
                  Dev Tools
                </button>
              )}
              <button
                className="btn-inline auth-settings-btn"
                type="button"
                title={t('auth.settings')}
                onClick={onOpenSettings}
              >
                &#9881;
              </button>
              <button
                className="btn-inline"
                type="button"
                onClick={onLogout}
              >
                {t('auth.logout')}
              </button>
            </>
          ) : (
            <button
              className="btn-inline"
              type="button"
              onClick={() => onOpenAuth('login')}
            >
              {t('auth.login_register')}
            </button>
          )}
        </div>

        <button
          className="icon-btn theme-toggle"
          type="button"
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          onClick={onToggleTheme}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>

        <div className="lang-switch" aria-label="Language">
          {['en', 'pt', 'es'].map(lang => (
            <button
              key={lang}
              className={`lang-btn${locale === lang ? ' is-active' : ''}`}
              type="button"
              onClick={() => setLocale(lang)}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
