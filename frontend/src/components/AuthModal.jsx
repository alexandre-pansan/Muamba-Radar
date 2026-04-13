import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { apiLogin, apiRegister } from '../api.js'

const PWD_RULES = [
  { id: 'len',     label: 'Mínimo 8 caracteres',           test: v => v.length >= 8 },
  { id: 'upper',   label: '1 letra maiúscula (A–Z)',        test: v => /[A-Z]/.test(v) },
  { id: 'digit',   label: '1 número (0–9)',                 test: v => /\d/.test(v) },
  { id: 'special', label: '1 caractere especial (!@#$…)',   test: v => /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/.test(v) },
]

export function PasswordRules({ value }) {
  if (!value) return null
  return (
    <ul className="pwd-rules" aria-label="Requisitos de senha">
      {PWD_RULES.map(r => (
        <li key={r.id} className={r.test(value) ? 'pwd-rule ok' : 'pwd-rule'}>
          <span className="pwd-rule-icon" aria-hidden="true">{r.test(value) ? '✓' : '○'}</span>
          {r.label}
        </li>
      ))}
    </ul>
  )
}

export default function AuthModal({
  open,
  tab,
  onTabChange,
  onClose,
  onLoginSuccess,
  onRegisterSuccess,
  onOpenLegal,
}) {
  const { t } = useI18n()
  const dialogRef = useRef(null)

  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [loginPassword, setLoginPassword]     = useState('')
  const [loginError, setLoginError]           = useState('')
  const [loginLoading, setLoginLoading]       = useState(false)

  const [regUsername, setRegUsername]   = useState('')
  const [regName, setRegName]           = useState('')
  const [regEmail, setRegEmail]         = useState('')
  const [regPassword, setRegPassword]   = useState('')
  const [regAccepted, setRegAccepted]   = useState(false)
  const [regError, setRegError]         = useState('')
  const [regLoading, setRegLoading]     = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setTimeout(() => dialog.querySelector('input')?.focus(), 50)
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
    if (!regAccepted) {
      setRegError('Você precisa aceitar a Política de Privacidade e os Termos de Uso para continuar.')
      return
    }
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
      setRegAccepted(false)
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
      className="modal modal-sm"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="modal-header">
        <nav className="auth-tabs">
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
        </nav>
        <button
          className="modal-close"
          type="button"
          aria-label="Fechar"
          onClick={onClose}
        >
          &times;
        </button>
      </div>

      <div className="modal-body">

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
            <span>{t('auth.password')}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={regPassword}
              onChange={e => setRegPassword(e.target.value)}
            />
          </label>
          <PasswordRules value={regPassword} />
          <label className="auth-consent">
            <input
              type="checkbox"
              checked={regAccepted}
              onChange={e => setRegAccepted(e.target.checked)}
            />
            <span>
              Li e aceito a{' '}
              {onOpenLegal
                ? <button type="button" className="btn-inline-link" onClick={() => onOpenLegal('privacy')}>Política de Privacidade</button>
                : <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>
              }
              {' '}e os{' '}
              {onOpenLegal
                ? <button type="button" className="btn-inline-link" onClick={() => onOpenLegal('terms')}>Termos de Uso</button>
                : <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</a>
              }.
            </span>
          </label>
          {regError && <p className="auth-error">{regError}</p>}
          <button type="submit" className="compare-btn" disabled={regLoading || !regAccepted}>
            {regLoading ? '\u2026' : t('auth.create')}
          </button>
        </form>
      )}

      </div>
    </dialog>
  )
}
