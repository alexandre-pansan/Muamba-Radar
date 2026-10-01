import React, { useState } from 'react'
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

// Shared between AuthModal (in-context prompt) and LoginPage (direct-nav destination) —
// both call the same real apiLogin/apiRegister, never a fake/autofilled shortcut.
export function LoginForm({ onSuccess }) {
  const { t } = useI18n()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { access_token } = await apiLogin(identifier.trim(), password)
      setIdentifier('')
      setPassword('')
      onSuccess(access_token)
    } catch (err) {
      setError(err.message || t('auth.login_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>{t('auth.welcome')}</h2>
      <label className="field">
        <span>{t('auth.email_or_username')}</span>
        <input
          type="text"
          autoComplete="username"
          required
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{t('auth.password')}</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="auth-error">{error}</p>}
      <button type="submit" className="compare-btn" disabled={loading}>
        {loading ? '\u2026' : t('auth.login')}
      </button>
    </form>
  )
}

export function RegisterForm({ onSuccess, onOpenLegal }) {
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!accepted) {
      setError('Você precisa aceitar a Política de Privacidade e os Termos de Uso para continuar.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { access_token } = await apiRegister(username.trim(), name.trim(), email.trim(), password)
      setUsername('')
      setName('')
      setEmail('')
      setPassword('')
      setAccepted(false)
      onSuccess(access_token)
    } catch (err) {
      setError(err.message || t('auth.register_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>{t('auth.create')}</h2>
      <label className="field">
        <span>{t('auth.username')}</span>
        <input
          type="text"
          autoComplete="username"
          required
          minLength={3}
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
      </label>
      <label className="field">
        <span>
          {t('auth.name')} <span className="field-optional">{t('auth.optional')}</span>
        </span>
        <input
          type="text"
          autoComplete="name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{t('auth.email')}</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{t('auth.password')}</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </label>
      <PasswordRules value={password} />
      <label className="auth-consent">
        <input
          type="checkbox"
          checked={accepted}
          onChange={e => setAccepted(e.target.checked)}
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
      {error && <p className="auth-error">{error}</p>}
      <button type="submit" className="compare-btn" disabled={loading || !accepted}>
        {loading ? '\u2026' : t('auth.create')}
      </button>
    </form>
  )
}
