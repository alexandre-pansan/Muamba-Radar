import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n.jsx'
import { apiUpdateMe, apiFetchUserSearches, getApiBase, getToken, apiBumpBetaNotice } from '../api.js'
import { PasswordRules } from './AuthForms.jsx'

// Seções da página — o id vira âncora na URL (/conta#taxas), então recarregar ou
// mandar o link abre direto na seção.
const SECTIONS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'senha', label: 'Senha' },
  { id: 'preferencias', label: 'Preferências' },
  { id: 'buscas', label: 'Buscas recentes' },
  { id: 'privacidade', label: 'Privacidade (LGPD)' },
  { id: 'aviso-beta', label: 'Aviso Beta', admin: true },
]

/** Configurações da conta como página (/conta) — antes era um popup. */
export default function AccountSettings({
  currentUser,
  currentPrefs,
  onUserUpdate,
  onPrefChange,
  onSearchClick,
  onNeedAuth,
}) {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()

  const [profileName, setProfileName]       = useState('')
  const [profileError, setProfileError]     = useState('')
  const [profileSaving, setProfileSaving]   = useState(false)
  const [profileSaved, setProfileSaved]     = useState(false)

  const [newPassword, setNewPassword]       = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError]   = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSaved, setPasswordSaved]   = useState(false)

  const [userSearches, setUserSearches]     = useState([])
  const [searchesLoading, setSearchesLoading] = useState(false)

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError]     = useState('')

  async function handleExportData() {
    const res = await fetch(`${getApiBase()}/auth/me/export`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'muambaradar-meus-dados.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDeleteAccount() {
    setDeleteError('')
    try {
      const res = await fetch(`${getApiBase()}/auth/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error('Falha ao excluir conta.')
      window.location.reload()
    } catch (err) {
      setDeleteError(err.message)
    }
  }

  useEffect(() => {
    setProfileName(currentUser?.name || '')
    loadUserSearches()
  }, [currentUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Abre na seção da âncora (#taxas) ao chegar ou recarregar.
  useEffect(() => {
    const id = location.hash.replace('#', '')
    if (!id || !currentUser) return
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
  }, [location.hash, currentUser])

  function goToSection(id) {
    navigate({ hash: id }, { replace: true })
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function loadUserSearches() {
    if (!currentUser) return
    setSearchesLoading(true)
    try {
      const data = await apiFetchUserSearches()
      setUserSearches(data)
    } catch (_) {
      setUserSearches([])
    } finally {
      setSearchesLoading(false)
    }
  }

  async function handleProfileSubmit(e) {
    e.preventDefault()
    setProfileError('')
    setProfileSaving(true)
    try {
      const user = await apiUpdateMe({ name: profileName.trim() || null })
      onUserUpdate(user)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch (err) {
      setProfileError(err.message || t('config.save_error'))
    } finally {
      setProfileSaving(false)
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setPasswordError('')
    if (newPassword !== confirmPassword) {
      setPasswordError(t('config.password_mismatch'))
      return
    }
    setPasswordSaving(true)
    try {
      await apiUpdateMe({ password: newPassword })
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
      setTimeout(() => setPasswordSaved(false), 2000)
    } catch (err) {
      setPasswordError(err.message || t('config.save_error'))
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handlePrefToggle(e) {
    await onPrefChange({ show_margin: e.target.checked })
  }

  async function handleReenableBetaNotice() {
    await onPrefChange({ hide_beta_notice: false })
    // Clear all versioned localStorage keys so it shows again
    Object.keys(localStorage)
      .filter(k => k.startsWith('muamba_beta_dismissed_v'))
      .forEach(k => localStorage.removeItem(k))
  }

  const [bumpingBeta, setBumpingBeta] = useState(false)
  const [bumpedBeta, setBumpedBeta]   = useState(false)
  async function handleBumpBetaNotice() {
    setBumpingBeta(true)
    try {
      await apiBumpBetaNotice()
      // Clear own localStorage so the modal shows for self too
      Object.keys(localStorage)
        .filter(k => k.startsWith('muamba_beta_dismissed_v'))
        .forEach(k => localStorage.removeItem(k))
      await onPrefChange({ hide_beta_notice: false })
      setBumpedBeta(true)
      setTimeout(() => setBumpedBeta(false), 3000)
    } catch (_) {}
    setBumpingBeta(false)
  }

  if (!currentUser) {
    return (
      <div className="account-page">
        <div className="account-guest">
          <h1 className="page-title">⚙️ Configurações da conta</h1>
          <p>Entre na sua conta para ver e alterar suas configurações.</p>
          <button type="button" className="btn-save" onClick={onNeedAuth}>Entrar</button>
        </div>
      </div>
    )
  }

  const visibleSections = SECTIONS.filter(sec => !sec.admin || currentUser.is_admin)

  return (
    <div className="account-page">
      <h1 className="page-title">⚙️ Configurações da conta</h1>

      <div className="account-layout">
      <nav className="account-nav" aria-label="Seções">
        {visibleSections.map(sec => (
          <button
            key={sec.id}
            type="button"
            className={`account-nav__item${location.hash === `#${sec.id}` ? ' is-active' : ''}`}
            onClick={() => goToSection(sec.id)}
          >
            {sec.label}
          </button>
        ))}
      </nav>

      <div className="account-sections">
      {/* Profile section */}
      <section className="ucm-section account-card" id="perfil">
        <h3 className="ucm-section-title">{t('config.profile_section')}</h3>
        <p className="account-card__meta">{currentUser.email}{currentUser.username ? ` · @${currentUser.username}` : ''}</p>
        <form className="ucm-form" onSubmit={handleProfileSubmit}>
          <label className="field">
            <span>{t('config.name_label')}</span>
            <input
              type="text"
              autoComplete="name"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
            />
          </label>
          {profileError && <p className="ucm-error">{profileError}</p>}
          <button
            type="submit"
            className="btn-save"
            disabled={profileSaving}
          >
            {profileSaved ? t('config.saved') : t('config.save_name')}
          </button>
        </form>
      </section>

      <section className="ucm-section account-card" id="senha">
        <h3 className="ucm-section-title">Senha</h3>
        <form className="ucm-form" onSubmit={handlePasswordSubmit}>
          <label className="field">
            <span>{t('config.new_password')}</span>
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </label>
          <PasswordRules value={newPassword} />
          <label className="field">
            <span>{t('config.confirm_password')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </label>
          {passwordError && <p className="ucm-error">{passwordError}</p>}
          <button
            type="submit"
            className="btn-save"
            disabled={passwordSaving}
          >
            {passwordSaved ? t('config.saved') : t('config.change_password')}
          </button>
        </form>
      </section>

      {/* Preferences section */}
      <section className="ucm-section account-card" id="preferencias">
        <h3 className="ucm-section-title">{t('config.prefs_section')}</h3>
        <label className="pref-row">
          <span>{t('config.show_margin')}</span>
          <input
            type="checkbox"
            className="pref-toggle"
            role="switch"
            aria-checked={currentPrefs?.show_margin ?? false}
            checked={currentPrefs?.show_margin ?? false}
            onChange={handlePrefToggle}
          />
        </label>
      </section>

      {currentUser?.is_admin && (
        <section className="ucm-section account-card" id="aviso-beta">
          <h3 className="ucm-section-title">Aviso Beta</h3>
          <div className="ucm-beta-actions">
            <button className="btn-inline btn-muted" onClick={handleReenableBetaNotice}>
              Re-habilitar para mim
            </button>
            <button
              className="btn-inline"
              onClick={handleBumpBetaNotice}
              disabled={bumpingBeta}
            >
              {bumpedBeta ? 'Enviado para todos ✓' : bumpingBeta ? 'Aguarde…' : 'Forçar para todos os usuários'}
            </button>
            <p className="ucm-hint">
              "Forçar para todos" incrementa a versão global — ignora o "Não mostrar mais" de todos.
            </p>
          </div>
        </section>
      )}

      {/* Recent searches section */}
      <section className="ucm-section account-card" id="buscas">
        <h3 className="ucm-section-title">{t('config.searches_section')}</h3>
        <ul className="ucm-search-list">
          {searchesLoading ? (
            <li className="ucm-empty">&hellip;</li>
          ) : userSearches.length === 0 ? (
            <li className="ucm-empty">{t('sidebar.no_recents')}</li>
          ) : (
            userSearches.map((s, i) => (
              <li
                key={i}
                className="ucm-search-item"
                role="button"
                tabIndex={0}
                onClick={() => onSearchClick(s.query)}
                onKeyDown={e => e.key === 'Enter' && onSearchClick(s.query)}
              >
                {s.query}
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Privacy / LGPD section */}
      <section className="ucm-section ucm-privacy-section account-card" id="privacidade">
        <h3 className="ucm-section-title">Privacidade (LGPD)</h3>
        <p className="ucm-privacy-desc">
          Você tem direito de exportar seus dados ou excluir permanentemente sua conta e todos os dados pessoais associados.
        </p>
        <div className="ucm-privacy-actions">
          <button type="button" className="btn-save btn-save-secondary" onClick={handleExportData}>
            <span aria-hidden="true">⬇</span> Exportar meus dados (JSON)
          </button>
          {!deleteConfirm ? (
            <button type="button" className="btn-delete" onClick={() => setDeleteConfirm(true)}>
              Excluir minha conta
            </button>
          ) : (
            <div className="ucm-delete-confirm">
              <span>Tem certeza? Esta ação é irreversível.</span>
              <div className="btn-row">
                <button type="button" className="btn-delete" onClick={handleDeleteAccount}>
                  Sim, excluir tudo
                </button>
                <button type="button" className="btn-save btn-save-secondary" onClick={() => setDeleteConfirm(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {deleteError && <p className="ucm-error">{deleteError}</p>}
        </div>
      </section>
      </div>
      </div>
    </div>
  )
}
