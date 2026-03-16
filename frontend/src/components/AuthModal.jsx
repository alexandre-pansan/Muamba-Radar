import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { apiLogin, apiRegister } from '../api.js'

export default function AuthModal({
  open,
  tab,
  onTabChange,
  onClose,
  onLoginSuccess,
  onRegisterSuccess,
}) {
  const { t } = useI18n()
  const dialogRef = useRef(null)

  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [loginPassword, setLoginPassword]     = useState('')
  const [loginError, setLoginError]           = useState('')
  const [loginLoading, setLoginLoading]       = useState(false)

  const [regUsername, setRegUsername] = useState('')
  const [regName, setRegName]         = useState('')
  const [regEmail, setRegEmail]       = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regError, setRegError]       = useState('')
  const [regLoading, setRegLoading]   = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  function handleTabChange(newTab) {
    onTabChange(newTab)
    setLoginError('')
    setRegError('')
  }

  async function handleLoginSubmit(e) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const { access_token } = await apiLogin(loginIdentifier.trim(), loginPassword)
      setLoginIdentifier('')
      setLoginPassword('')
      onLoginSuccess(access_token)
    } catch (err) {
      setLoginError(err.message || t('auth.login_failed'))
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault()
    setRegError('')
    setRegLoading(true)
    try {
      const { access_token } = await apiRegister(
        regUsername.trim(),
        regName.trim(),
        regEmail.trim(),
        regPassword,
      )
      setRegUsername('')
      setRegName('')
      setRegEmail('')
      setRegPassword('')
      onRegisterSuccess(access_token)
    } catch (err) {
      setRegError(err.message || t('auth.register_failed'))
    } finally {
      setRegLoading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="auth-modal"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <button
        className="auth-modal-close"
        aria-label="Close"
        onClick={onClose}
      >
        &times;
      </button>

      <div className="auth-tabs">
        <button
          className={`auth-tab${tab === 'login' ? ' is-active' : ''}`}
          onClick={() => handleTabChange('login')}
        >
          {t('auth.login')}
        </button>
        <button
          className={`auth-tab${tab === 'register' ? ' is-active' : ''}`}
          onClick={() => handleTabChange('register')}
        >
          {t('auth.register')}
        </button>
      </div>

      {tab === 'login' && (
        <form className="auth-form" onSubmit={handleLoginSubmit}>
          <h2>{t('auth.welcome')}</h2>
          <label className="field">
            <span>{t('auth.email_or_username')}</span>
            <input
              type="text"
              autoComplete="username"
              required
              value={loginIdentifier}
              onChange={e => setLoginIdentifier(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('auth.password')}</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
            />
          </label>
          {loginError && <p className="auth-error">{loginError}</p>}
          <button type="submit" className="compare-btn" disabled={loginLoading}>
            {loginLoading ? '\u2026' : t('auth.login')}
          </button>
        </form>
      )}

      {tab === 'register' && (
        <form className="auth-form" onSubmit={handleRegisterSubmit}>
          <h2>{t('auth.create')}</h2>
          <label className="field">
            <span>{t('auth.username')}</span>
            <input
              type="text"
              autoComplete="username"
              required
              minLength={3}
              value={regUsername}
              onChange={e => setRegUsername(e.target.value)}
            />
          </label>
          <label className="field">
            <span>
              {t('auth.name')} <span className="field-optional">{t('auth.optional')}</span>
            </span>
            <input
              type="text"
              autoComplete="name"
              value={regName}
              onChange={e => setRegName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('auth.email')}</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={regEmail}
              onChange={e => setRegEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>
              {t('auth.password')} <span className="field-optional">{t('auth.min_chars')}</span>
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={regPassword}
              onChange={e => setRegPassword(e.target.value)}
            />
          </label>
          {regError && <p className="auth-error">{regError}</p>}
          <button type="submit" className="compare-btn" disabled={regLoading}>
            {regLoading ? '\u2026' : t('auth.create')}
          </button>
        </form>
      )}
    </dialog>
  )
}
