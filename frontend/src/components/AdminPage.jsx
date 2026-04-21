import React, { useEffect, useRef, useState } from 'react'
import {
  apiFetchSources,
  apiTestSearch,
  apiRefreshCache,
  apiAdminListUsers,
  apiAdminDeleteUser,
  apiAdminToggleAdmin,
  apiFetchConfig,
  apiAdminUpdateDonateStats,
  apiBumpBetaNotice,
  apiAdminUpdateBetaNoticeText,
  apiRefreshCacheStatus,
  apiAdminListStores,
  apiAdminCreateStore,
  apiAdminUpdateStore,
  apiAdminDeleteStore,
  apiAdminUploadStorePhoto,
  apiAdminUnmatchedStores,
  apiAdminExportStores,
  apiAdminImportStores,
  apiAdminMapsSearch,
  apiAdminListReports,
  apiAdminResolveReport,
  getApiBase,
} from '../api.js'

// ── Shared ───────────────────────────────────────────────────────────────────

const PREVIEW_COUNT = 3

function RawOffersModal({ adapter, onClose }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="raw-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="raw-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Resultados raw — ${adapter.adapter_id}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="raw-modal-header">
          <span className="raw-modal-title">
            Raw — <strong>{adapter.adapter_id}</strong>
            <span className={`adapter-card-country ${adapter.country}`} style={{ marginLeft: 8 }}>
              {adapter.country.toUpperCase()}
            </span>
          </span>
          <span className="raw-modal-count">{adapter.raw_offers.length} itens</span>
          <button className="raw-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="raw-modal-body">
          {adapter.raw_offers.map((o, i) => (
            <div key={i} className={`adapter-offer ${adapter.sample_offers.some(f => f.title === o.title) ? '' : 'offer-filtered-out'}`}>
              <span className="adapter-offer-idx">{i + 1}</span>
              <span className="adapter-offer-title" title={o.title}>{o.title}</span>
              <span className="adapter-offer-price">
                {o.currency} {o.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="adapter-offer-link">↗</a>
            </div>
          ))}
        </div>
        <div className="raw-modal-footer">
          <span className="raw-modal-legend">
            <span className="legend-dot legend-kept" /> Passou no filtro ({adapter.filtered_count})
            &nbsp;&nbsp;
            <span className="legend-dot legend-cut" /> Cortado ({adapter.raw_count - adapter.filtered_count})
          </span>
        </div>
      </div>
    </div>
  )
}

function AdminAdapterCard({ adapter }) {
  const [expanded, setExpanded] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const timingClass =
    adapter.timing_ms > 5000 ? 'timing--slow' : adapter.timing_ms > 2000 ? 'timing--mid' : 'timing--ok'
  const cardClass =
    adapter.error ? 'adapter-card adapter-card--error'
    : adapter.filtered_count > 0 ? 'adapter-card adapter-card--success'
    : 'adapter-card'

  const offers = adapter.sample_offers
  const visible = expanded ? offers : offers.slice(0, PREVIEW_COUNT)
  const hidden  = offers.length - PREVIEW_COUNT

  return (
    <div className={cardClass}>
      {showRaw && <RawOffersModal adapter={adapter} onClose={() => setShowRaw(false)} />}
      <div className="adapter-card-head" onClick={() => offers.length && setExpanded(e => !e)}>
        <span className="adapter-card-name">{adapter.adapter_id}</span>
        <span className={`adapter-card-country ${adapter.country}`}>{adapter.country.toUpperCase()}</span>
        <span className={`adapter-card-timing ${timingClass}`}>{adapter.timing_ms}ms</span>
        <span className="adapter-card-stats-inline">
          <button
            className="adapter-stat-btn"
            onClick={e => { e.stopPropagation(); setShowRaw(true) }}
            title="Ver todos os itens raw"
          >
            Raw <strong>{adapter.raw_count}</strong>
          </button>
          <span className="adapter-stat">Filtrado <strong className="text-success">{adapter.filtered_count}</strong></span>
        </span>
        {offers.length > 0 && (
          <span className="adapter-card-chevron">{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {(expanded || offers.length <= PREVIEW_COUNT) && offers.length > 0 && (
        <div className="adapter-card-body">
          {adapter.error && <div className="adapter-card-error">{adapter.error}</div>}
          <div className="adapter-card-offers">
            {visible.map((o, i) => (
              <div key={i} className="adapter-offer">
                <span className="adapter-offer-idx">{i + 1}</span>
                <span className="adapter-offer-title" title={o.title}>{o.title}</span>
                <span className="adapter-offer-price">
                  {o.currency} {o.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="adapter-offer-link">↗</a>
              </div>
            ))}
          </div>
          {!expanded && hidden > 0 && (
            <button className="adapter-show-more" onClick={() => setExpanded(true)}>
              Ver mais {hidden} resultado{hidden !== 1 ? 's' : ''} ▼
            </button>
          )}
          {expanded && offers.length > PREVIEW_COUNT && (
            <button className="adapter-show-more" onClick={() => setExpanded(false)}>
              Recolher ▲
            </button>
          )}
        </div>
      )}

      {!expanded && offers.length === 0 && !adapter.error && (
        <div className="adapter-card-body">
          <p className="adapter-card-empty">Nenhum resultado.</p>
        </div>
      )}
      {!expanded && adapter.error && (
        <div className="adapter-card-body">
          <div className="adapter-card-error">{adapter.error}</div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Usuários ─────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    setError('')
    try {
      setUsers(await apiAdminListUsers())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Deletar "${user.email}"? Essa ação não pode ser desfeita.`)) return
    setBusy(user.id)
    try {
      await apiAdminDeleteUser(user.id)
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleToggleAdmin(user) {
    setBusy(user.id)
    try {
      const updated = await apiAdminToggleAdmin(user.id)
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="admin-tab-loading">Carregando...</p>
  if (error)   return <p className="admin-tab-error">{error}</p>

  return (
    <div className="admin-tab-body">
      <div className="admin-tab-toolbar">
        <h2 className="admin-section-title">Usuários</h2>
        <span className="admin-count-badge">{users.length}</span>
        <button className="admin-ghost-btn" onClick={loadUsers}>Atualizar</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="col-id">ID</th>
              <th>Email</th>
              <th className="col-name">Nome</th>
              <th>Admin</th>
              <th className="col-date">Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td className="col-id td-muted">#{user.id}</td>
                <td className="td-email">{user.email}</td>
                <td className="col-name td-muted">{user.name || '—'}</td>
                <td>
                  {user.is_admin
                    ? <span className="admin-role-badge">Admin</span>
                    : <span className="td-muted">—</span>}
                </td>
                <td className="col-date td-muted td-nowrap">
                  {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td>
                  <div className="admin-actions">
                    <button
                      disabled={busy === user.id}
                      onClick={() => handleToggleAdmin(user)}
                      className={`admin-action-btn ${user.is_admin ? 'is-demote' : 'is-promote'}`}
                    >
                      {user.is_admin ? '−admin' : '+admin'}
                    </button>
                    <button
                      disabled={busy === user.id}
                      onClick={() => handleDelete(user)}
                      className="admin-action-btn is-delete"
                    >
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Dev Tools ────────────────────────────────────────────────────────────

function DevToolsTab() {
  const [testQuery, setTestQuery] = useState('')
  const [adapters, setAdapters] = useState([])
  const [checked, setChecked] = useState({})
  const [running, setRunning] = useState(false)
  const [rawMode, setRawMode] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [totalRaw, setTotalRaw] = useState(null)
  const [totalFiltered, setTotalFiltered] = useState(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    apiFetchSources()
      .then(list => {
        setAdapters(list)
        const init = {}
        list.forEach(a => { init[a.source] = true })
        setChecked(init)
      })
      .catch(e => setLoadError(e.message || 'Failed to fetch'))
  }, [])

  function toggleAll(val) {
    const next = {}
    adapters.forEach(a => { next[a.source] = val })
    setChecked(next)
  }

  async function handleRun() {
    const q = testQuery.trim()
    if (!q) return
    const selected = adapters.filter(a => checked[a.source]).map(a => a.source)
    setRunning(true)
    setError('')
    setResults(null)
    setTotalRaw(null)
    setTotalFiltered(null)
    try {
      const data = await apiTestSearch(q, selected, rawMode)
      setTotalRaw(data.total_raw)
      setTotalFiltered(data.total_filtered)
      setResults([...data.adapters].sort((a, b) => {
        if (a.error && !b.error) return -1
        if (!a.error && b.error) return 1
        return b.filtered_count - a.filtered_count
      }))
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const byCountry = { br: [], py: [] }
  adapters.forEach(a => { if (byCountry[a.country]) byCountry[a.country].push(a) })

  if (loadError) return (
    <div className="dev-tools-load-error">
      <strong>Backend inacessível:</strong> {loadError}
      <p>Verifique se o backend está rodando em localhost:8000</p>
    </div>
  )

  return (
    <div className="dev-tools-grid">
      {/* Left panel */}
      <div className="dev-tools-left">
        <div className="dev-tools-section">
          <p className="dev-tools-label">Test Search</p>
          <input
            className="dev-tools-input"
            type="text"
            placeholder="ex: iphone 15 128gb"
            value={testQuery}
            onChange={e => setTestQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRun()}
          />
          <button
            className={`dev-tools-run-btn${running ? ' is-running' : ''}`}
            onClick={handleRun}
            disabled={running}
          >
            {running ? 'Rodando…' : 'Rodar busca'}
          </button>
          <label className="dev-tools-raw-toggle">
            <input
              type="checkbox"
              className="dev-tools-checkbox"
              checked={rawMode}
              onChange={e => setRawMode(e.target.checked)}
            />
            Modo raw (sem filtro)
          </label>
        </div>

        <div className="dev-tools-section">
          <p className="dev-tools-label">Adapters</p>
          <div className="dev-tools-toggle-row">
            {['Todos', 'Nenhum'].map((label, i) => (
              <button key={label} className="dev-tools-toggle-btn" onClick={() => toggleAll(i === 0)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="dev-tools-adapters">
          {Object.entries(byCountry).map(([country, group]) => {
            if (!group.length) return null
            return (
              <React.Fragment key={country}>
                <p className="dev-tools-country-label">{country === 'br' ? 'Brasil' : 'Paraguai'}</p>
                {group.map(a => (
                  <label key={a.source} className="dev-tools-adapter-row">
                    <input
                      type="checkbox"
                      className="dev-tools-checkbox"
                      checked={!!checked[a.source]}
                      onChange={() => setChecked(prev => ({ ...prev, [a.source]: !prev[a.source] }))}
                    />
                    <span className="dev-tools-adapter-name">{a.source}</span>
                    <span className={`adapter-card-country ${country}`}>{country.toUpperCase()}</span>
                  </label>
                ))}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className="dev-tools-right">
        <div className="dev-tools-results-header">
          <p className="dev-tools-results-title">Resultados</p>
          {totalRaw != null && (
            <span className="dev-tools-stat">Raw <strong>{totalRaw}</strong></span>
          )}
          {totalFiltered != null && (
            <span className="dev-tools-stat">Filtrado <strong className="text-success">{totalFiltered}</strong></span>
          )}
        </div>
        <div className="dev-tools-results-body">
          {error && <div className="admin-error-box">{error}</div>}
          {!results && !error && (
            <div className="dev-tools-empty">Rode uma busca para ver os resultados por adapter</div>
          )}
          {results && results.map((adapter, i) => <AdminAdapterCard key={i} adapter={adapter} />)}
        </div>
      </div>
    </div>
  )
}

// ── Tab: Cache ────────────────────────────────────────────────────────────────

function CacheTab() {
  const [status, setStatus] = useState(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null) // {done, total, current}
  const pollRef = React.useRef(null)

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const p = await apiRefreshCacheStatus()
        setProgress(p)
        if (!p.running) {
          stopPolling()
          setRunning(false)
          setStatus({ ok: true, text: `Concluído! ${p.total} queries atualizadas.` })
        }
      } catch (_) {}
    }, 2000)
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  React.useEffect(() => () => stopPolling(), [])

  async function handleRefresh() {
    setRunning(true)
    setStatus(null)
    setProgress(null)
    try {
      const data = await apiRefreshCache()
      if (data.status === 'already_running') {
        setProgress({ running: true, done: data.done, total: data.total, current: data.current })
      } else {
        setProgress({ running: true, done: 0, total: data.unique_queries, current: '' })
      }
      startPolling()
    } catch (e) {
      setStatus({ ok: false, text: e.message })
      setRunning(false)
    }
  }

  const pct = progress?.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="admin-cache">
      <h2 className="admin-section-title">Cache de Buscas</h2>
      <p className="admin-cache-desc">
        Re-executa todas as buscas salvas no cache em background, atualizando os preços. Pode demorar alguns minutos.
      </p>
      <button
        className={`dev-tools-run-btn${running ? ' is-running' : ''}`}
        onClick={handleRefresh}
        disabled={running}
      >
        {running ? `Rodando… (${pct}%)` : 'Atualizar cache agora'}
      </button>

      {progress?.running && (
        <div className="cache-progress">
          <div className="cache-progress-bar-wrap">
            <div className="cache-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="cache-progress-info">
            <span>{progress.done} / {progress.total} queries</span>
            {progress.current && <span className="cache-progress-current">↻ {progress.current}</span>}
          </div>
        </div>
      )}

      {status && (
        <div className={`admin-status-box ${status.ok ? 'is-ok' : 'is-error'}`}>{status.text}</div>
      )}
    </div>
  )
}

// ── Tab: Doações ──────────────────────────────────────────────────────────────

function DonateTab() {
  const [goal, setGoal] = useState('')
  const [raised, setRaised] = useState('')
  const [supporters, setSupporters] = useState('')
  const [betaVersion, setBetaVersion] = useState(null)
  const [betaTitle, setBetaTitle] = useState('')
  const [betaBody1, setBetaBody1] = useState('')
  const [betaBody2, setBetaBody2] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bumping, setBumping] = useState(false)
  const [savingText, setSavingText] = useState(false)
  const [status, setStatus] = useState(null)
  const [betaStatus, setBetaStatus] = useState(null)
  const [betaTextStatus, setBetaTextStatus] = useState(null)

  useEffect(() => {
    apiFetchConfig()
      .then(cfg => {
        setGoal(String(cfg.donate_goal ?? 80))
        setRaised(String(cfg.donate_raised ?? 0))
        setSupporters(String(cfg.donate_supporters ?? 0))
        setBetaVersion(cfg.beta_notice_version ?? 1)
        setBetaTitle(cfg.beta_notice_title ?? '')
        setBetaBody1(cfg.beta_notice_body1 ?? '')
        setBetaBody2(cfg.beta_notice_body2 ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSaveBetaText() {
    setSavingText(true)
    setBetaTextStatus(null)
    try {
      await apiAdminUpdateBetaNoticeText({ beta_notice_title: betaTitle, beta_notice_body1: betaBody1, beta_notice_body2: betaBody2 })
      setBetaTextStatus({ ok: true, text: 'Textos salvos!' })
    } catch (e) {
      setBetaTextStatus({ ok: false, text: e.message })
    } finally {
      setSavingText(false)
    }
  }

  async function handleBumpBeta() {
    setBumping(true)
    setBetaStatus(null)
    try {
      const res = await apiBumpBetaNotice()
      setBetaVersion(res.beta_notice_version)
      setBetaStatus({ ok: true, text: `Versão atualizada para v${res.beta_notice_version} — aviso reaparecerá para todos.` })
    } catch (e) {
      setBetaStatus({ ok: false, text: e.message })
    } finally {
      setBumping(false)
    }
  }

  async function handleSave() {
    const g = parseInt(goal, 10)
    const r = parseInt(raised, 10)
    const s = parseInt(supporters, 10)
    if (isNaN(g) || isNaN(r) || isNaN(s) || g < 1 || r < 0 || s < 0) {
      setStatus({ ok: false, text: 'Valores inválidos.' })
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      await apiAdminUpdateDonateStats({ donate_goal: g, donate_raised: r, donate_supporters: s })
      setStatus({ ok: true, text: 'Salvo! Os valores serão refletidos na sidebar.' })
    } catch (e) {
      setStatus({ ok: false, text: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="admin-tab-loading">Carregando...</p>

  return (
    <div className="admin-tab-body">
      <h2 className="admin-section-title">Contador de Doações</h2>
      <p className="admin-cache-desc">
        Atualize manualmente quando receber uma doação via PIX. Os valores aparecem na sidebar para todos os usuários.
      </p>

      <div className="donate-admin-form">
        <label className="donate-admin-label">
          Meta mensal (R$)
          <input
            className="donate-admin-input"
            type="number"
            min="1"
            value={goal}
            onChange={e => setGoal(e.target.value)}
          />
        </label>

        <label className="donate-admin-label">
          Arrecadado este mês (R$)
          <input
            className="donate-admin-input"
            type="number"
            min="0"
            value={raised}
            onChange={e => setRaised(e.target.value)}
          />
        </label>

        <label className="donate-admin-label">
          Apoiadores este mês
          <input
            className="donate-admin-input"
            type="number"
            min="0"
            value={supporters}
            onChange={e => setSupporters(e.target.value)}
          />
        </label>

        <button
          className={`dev-tools-run-btn${saving ? ' is-running' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>

        {status && (
          <div className={`admin-status-box ${status.ok ? 'is-ok' : 'is-error'}`}>{status.text}</div>
        )}
      </div>

      <div className="admin-sep" />

      <h2 className="admin-section-title">Aviso Beta</h2>
      <p className="admin-cache-desc">
        Ao incrementar a versão, o aviso beta reaparecerá para todos os usuários (incluindo quem já clicou em "Não mostrar mais").
      </p>
      <div className="donate-admin-form">
        <label className="donate-admin-label">
          Título
          <input className="donate-admin-input" type="text" value={betaTitle} onChange={e => setBetaTitle(e.target.value)} />
        </label>
        <label className="donate-admin-label">
          Parágrafo 1 (suporta HTML básico)
          <textarea className="donate-admin-input" rows={3} style={{ resize: 'vertical', height: 'auto' }} value={betaBody1} onChange={e => setBetaBody1(e.target.value)} />
        </label>
        <label className="donate-admin-label">
          Parágrafo 2
          <textarea className="donate-admin-input" rows={2} style={{ resize: 'vertical', height: 'auto' }} value={betaBody2} onChange={e => setBetaBody2(e.target.value)} />
        </label>
        <button
          className={`dev-tools-run-btn${savingText ? ' is-running' : ''}`}
          onClick={handleSaveBetaText}
          disabled={savingText}
        >
          {savingText ? 'Salvando…' : 'Salvar textos'}
        </button>
        {betaTextStatus && (
          <div className={`admin-status-box ${betaTextStatus.ok ? 'is-ok' : 'is-error'}`}>{betaTextStatus.text}</div>
        )}
      </div>

      <div className="donate-admin-form" style={{ marginTop: 16 }}>
        <div className="donate-admin-label">
          Versão atual
          <span className="donate-admin-input" style={{ display: 'flex', alignItems: 'center', background: 'var(--card-bg)', cursor: 'default' }}>
            v{betaVersion ?? '…'}
          </span>
        </div>
        <button
          className={`dev-tools-run-btn${bumping ? ' is-running' : ''}`}
          onClick={handleBumpBeta}
          disabled={bumping}
        >
          {bumping ? 'Atualizando…' : '↑ Incrementar versão (força reexibição)'}
        </button>
        {betaStatus && (
          <div className={`admin-status-box ${betaStatus.ok ? 'is-ok' : 'is-error'}`}>{betaStatus.text}</div>
        )}
      </div>

      <div className="donate-admin-preview">
        <p className="dev-tools-label">Preview</p>
        <div className="donate-admin-bar-wrap">
          <div className="donate-admin-bar">
            <div
              className="donate-admin-bar-fill"
              style={{ width: `${Math.min(100, Math.round((parseInt(raised, 10) / parseInt(goal, 10)) * 100) || 0)}%` }}
            />
          </div>
          <span className="donate-admin-bar-label">
            R$ {raised || 0} de R$ {goal || 0}/mês · {supporters || 0} apoiadores
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Stores Tab ────────────────────────────────────────────────────────────────

const EMPTY_STORE = { name: '', country: 'py', name_aliases: '', address: '', city: '', lat: '', lng: '', photo_url: '', google_maps_url: '' }
// Stores are PY-only (location feature is Paraguay-specific)

function StoreForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_STORE, ...initial })
  const photoRef = useRef(null)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleSubmit(e) {
    e.preventDefault()
    const aliases = form.name_aliases ? form.name_aliases.split(',').map(s => s.trim()).filter(Boolean) : []
    onSave({
      name: form.name,
      country: form.country,
      name_aliases: aliases,
      address: form.address || null,
      city: form.city || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
      photo_url: form.photo_url || null,
      google_maps_url: form.google_maps_url || null,
    }, photoRef.current?.files?.[0])
  }

  return (
    <form className="store-form" onSubmit={handleSubmit}>
      <div className="store-form-row">
        <label className="store-form-label">Nome *</label>
        <input className="store-form-input" value={form.name} onChange={e => set('name', e.target.value)} required />
      </div>
      <div className="store-form-row">
        <label className="store-form-label">Aliases (vírgula)</label>
        <input className="store-form-input" value={form.name_aliases} onChange={e => set('name_aliases', e.target.value)} placeholder="Loja Americana, LA Paraguay..." />
      </div>
      <div className="store-form-row">
        <label className="store-form-label">Cidade</label>
        <input className="store-form-input" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Ciudad del Este" />
      </div>
      <div className="store-form-row">
        <label className="store-form-label">Endereço</label>
        <input className="store-form-input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Av. San Blas, 1234" />
      </div>
      <div className="store-form-row-half">
        <div>
          <label className="store-form-label">Latitude</label>
          <input className="store-form-input" type="number" step="any" value={form.lat} onChange={e => set('lat', e.target.value)} placeholder="-25.509" />
        </div>
        <div>
          <label className="store-form-label">Longitude</label>
          <input className="store-form-input" type="number" step="any" value={form.lng} onChange={e => set('lng', e.target.value)} placeholder="-54.617" />
        </div>
      </div>
      <div className="store-form-row">
        <label className="store-form-label">Link Google Maps</label>
        <input className="store-form-input" type="url" value={form.google_maps_url} onChange={e => set('google_maps_url', e.target.value)} placeholder="https://maps.google.com/..." />
      </div>
      <div className="store-form-row">
        <label className="store-form-label">Foto URL (ou upload)</label>
        <input className="store-form-input" value={form.photo_url} onChange={e => set('photo_url', e.target.value)} placeholder="https://..." />
        <input ref={photoRef} type="file" accept="image/*" className="store-form-file" />
      </div>
      <div className="store-form-actions">
        <button type="submit" className="admin-action-btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        <button type="button" className="admin-action-btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

function StoresTab() {
  const [stores, setStores] = useState([])
  const [unmatched, setUnmatched] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // creatingFrom: null | { store_name, country } — pre-fills form from unmatched row
  const [creatingFrom, setCreatingFrom] = useState(null)
  const [mapsResults, setMapsResults] = useState(null) // { store_name, country, u, results: [] }
  const [mapsSearchingName, setMapsSearchingName] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const importRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [s, u] = await Promise.all([apiAdminListStores(), apiAdminUnmatchedStores()])
      setStores(s)
      setUnmatched(u)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(data, photoFile) {
    setSaving(true)
    try {
      const created = await apiAdminCreateStore(data)
      let final = created
      if (photoFile) final = await apiAdminUploadStorePhoto(created.id, photoFile)
      setStores(prev => [...prev, final])
      setCreatingFrom(null)
      // refresh unmatched (newly created store may now absorb some rows)
      apiAdminUnmatchedStores().then(setUnmatched).catch(() => {})
    } catch (e) {
      alert(`Erro: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(id, data, photoFile) {
    setSaving(true)
    try {
      let updated = await apiAdminUpdateStore(id, data)
      if (photoFile) updated = await apiAdminUploadStorePhoto(id, photoFile)
      setStores(prev => prev.map(s => s.id === id ? updated : s))
      setEditingId(null)
      apiAdminUnmatchedStores().then(setUnmatched).catch(() => {})
    } catch (e) {
      alert(`Erro: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleMapsSearch(u) {
    if (mapsResults?.store_name === u.store_name) {
      setMapsResults(null)
      return
    }
    setMapsSearchingName(u.store_name)
    try {
      const results = await apiAdminMapsSearch(u.store_name)
      setMapsResults({ store_name: u.store_name, country: u.country, u, results })
      setCreatingFrom(null)
      setEditingId(null)
    } catch (e) {
      alert(`Maps: ${e.message}`)
    } finally {
      setMapsSearchingName(null)
    }
  }

  function handlePickMapsResult(result) {
    const u = mapsResults.u
    setCreatingFrom({ ...u, _mapsResult: result })
    setMapsResults(null)
    setEditingId(null)
  }

  async function handleDelete(id) {
    if (deleteId !== id) { setDeleteId(id); return }
    try {
      await apiAdminDeleteStore(id)
      setStores(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      alert(`Erro: ${e.message}`)
    } finally {
      setDeleteId(null)
    }
  }

  async function handleExport() {
    try {
      const data = await apiAdminExportStores()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `muamba-stores-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Erro ao exportar: ${e.message}`)
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const raw = JSON.parse(text)
      // Accept both full StoreInfo (with id) and stripped objects
      const payload = raw.map(({ name, country, name_aliases, address, city, lat, lng, photo_url, photo_data, photo_mime, google_maps_url }) => ({
        name, country: country ?? 'py', name_aliases: name_aliases ?? [],
        address: address ?? null, city: city ?? null,
        lat: lat ?? null, lng: lng ?? null,
        photo_url: photo_url ?? null,
        photo_data: photo_data ?? null,
        photo_mime: photo_mime ?? null,
        google_maps_url: google_maps_url ?? null,
      }))
      const result = await apiAdminImportStores(payload)
      setImportResult(result)
      // Reload stores list
      const [s, u] = await Promise.all([apiAdminListStores(), apiAdminUnmatchedStores()])
      setStores(s)
      setUnmatched(u)
    } catch (e) {
      alert(`Erro ao importar: ${e.message}`)
    }
  }

  if (loading) return <div className="admin-tab-body"><p className="admin-tab-loading">Carregando...</p></div>
  if (error) return <div className="admin-tab-body"><p className="admin-tab-error">{error}</p></div>

  return (
    <div className="admin-tab-body">

      {/* ── Lojas detectadas ── */}
      <div className="admin-stores-section">
        <div className="admin-stores-section-head">
          <h2 className="admin-section-title">Lojas detectadas</h2>
          {unmatched.length > 0 && (
            <span className="admin-count-badge">{unmatched.length} sem cadastro</span>
          )}
        </div>
        <p className="admin-stores-desc">
          Nomes capturados nas pesquisas que ainda não têm loja cadastrada. Clique em "+ Adicionar" para preencher os dados.
        </p>

        {unmatched.length === 0 ? (
          <p className="admin-empty">Nenhum nome sem loja — tudo associado.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Nome da loja</th><th>Ocorrências</th><th style={{ width: 180 }}></th></tr>
              </thead>
              <tbody>
                {unmatched.map((u, i) => (
                  <React.Fragment key={i}>
                    <tr className={creatingFrom?.store_name === u.store_name ? 'is-expanding' : ''}>
                      <td className="store-unmatched-name">{u.store_name}</td>
                      <td className="td-muted">{u.occurrences}×</td>
                      <td>
                        <div className="admin-actions">
                          <button
                            className={`admin-action-btn btn-sm${mapsResults?.store_name === u.store_name ? ' is-active-row' : ''}`}
                            disabled={mapsSearchingName === u.store_name}
                            onClick={() => handleMapsSearch(u)}
                            title="Buscar coordenadas via Nominatim / OSM"
                          >
                            {mapsSearchingName === u.store_name ? '…' : '🔍 Maps'}
                          </button>
                          <button
                            className={`admin-action-btn btn-sm${creatingFrom?.store_name === u.store_name ? ' is-active-row' : ''}`}
                            onClick={() => {
                              setCreatingFrom(creatingFrom?.store_name === u.store_name ? null : u)
                              setMapsResults(null)
                              setEditingId(null)
                            }}
                          >
                            {creatingFrom?.store_name === u.store_name ? '✕' : '+ Adicionar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {mapsResults?.store_name === u.store_name && (
                      <tr className="unmatched-form-row">
                        <td colSpan={3}>
                          <div className="maps-picker">
                            <p className="maps-picker-title">Selecione o local correto:</p>
                            {mapsResults.results.map((r, idx) => (
                              <button key={idx} className="maps-picker-item" onClick={() => handlePickMapsResult(r)}>
                                <span className="maps-picker-name">{r.name}</span>
                                <span className="maps-picker-addr">{r.address}</span>
                                <span className="maps-picker-coords">{r.lat?.toFixed(4)}, {r.lng?.toFixed(4)}</span>
                              </button>
                            ))}
                            <button className="admin-ghost-btn" style={{ marginTop: 6 }} onClick={() => setMapsResults(null)}>Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {creatingFrom?.store_name === u.store_name && (
                      <tr className="unmatched-form-row">
                        <td colSpan={3}>
                          <StoreForm
                            initial={{
                              ...EMPTY_STORE,
                              name: creatingFrom._mapsResult?.name || u.store_name,
                              name_aliases: u.store_name,
                              country: u.country,
                              address: creatingFrom._mapsResult?.address || '',
                              lat: creatingFrom._mapsResult?.lat ?? '',
                              lng: creatingFrom._mapsResult?.lng ?? '',
                              photo_url: creatingFrom._mapsResult?.photo_url || '',
                              google_maps_url: creatingFrom._mapsResult?.google_maps_url || '',
                            }}
                            onSave={handleCreate}
                            onCancel={() => setCreatingFrom(null)}
                            saving={saving}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Lojas cadastradas ── */}
      <div className="admin-stores-section">
        <div className="admin-stores-section-head">
          <h2 className="admin-section-title">Lojas cadastradas</h2>
          {stores.length > 0 && (
            <span className="admin-count-badge">{stores.length}</span>
          )}
          <div className="stores-io-actions">
            <button className="admin-ghost-btn" onClick={handleExport} title="Baixa JSON com todas as lojas">
              ↓ Exportar JSON
            </button>
            <button className="admin-ghost-btn" onClick={() => importRef.current?.click()} title="Importa JSON — atualiza existentes, adiciona novas">
              ↑ Importar JSON
            </button>
            <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={handleImport} />
          </div>
        </div>

        {importResult && (
          <div className="stores-import-result" onClick={() => setImportResult(null)}>
            ✓ Importado — {importResult.created} criadas · {importResult.updated} atualizadas · {importResult.skipped} sem alteração
            <span className="stores-import-dismiss">✕</span>
          </div>
        )}

        {stores.length === 0 ? (
          <p className="admin-empty">Nenhuma loja cadastrada ainda. Use a lista acima para criar.</p>
        ) : (
          <div className="stores-grid">
            {stores.map(store => (
              <div key={store.id} className={`store-card${editingId === store.id ? ' is-editing' : ''}`}>
                {editingId === store.id ? (
                  <StoreForm
                    initial={{
                      ...store,
                      name_aliases: store.name_aliases?.join(', ') ?? '',
                      address: store.address ?? '',
                      city: store.city ?? '',
                      lat: store.lat ?? '',
                      lng: store.lng ?? '',
                      photo_url: store.photo_url ?? '',
                      google_maps_url: store.google_maps_url ?? '',
                    }}
                    onSave={(data, file) => handleUpdate(store.id, data, file)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                ) : (
                  <>
                    {/* Photo */}
                    {store.photo_url ? (
                      <img
                        className="store-card-cover"
                        src={store.photo_url.startsWith('/static') ? `${getApiBase()}${store.photo_url}` : store.photo_url}
                        alt={store.name}
                      />
                    ) : (
                      <div className="store-card-cover store-card-cover--empty">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                      </div>
                    )}

                    {/* Body */}
                    <div className="store-card-body">
                      <span className="store-card-name">{store.name}</span>
                      {(store.city || store.address) && (
                        <span className="store-card-addr">
                          {[store.city, store.address].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      <div className="store-card-chips">
                        {store.lat && store.lng
                          ? <span className="store-chip store-chip--coords">📍 coords</span>
                          : <span className="store-chip store-chip--missing">sem coords</span>
                        }
                        {store.google_maps_url && (
                          <span className="store-chip store-chip--maps">Maps</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="store-card-actions">
                      <button className="admin-action-btn btn-sm" onClick={() => { setEditingId(store.id); setCreatingFrom(null) }}>Editar</button>
                      <button
                        className={`admin-action-btn btn-sm btn-danger${deleteId === store.id ? ' is-confirm' : ''}`}
                        onClick={() => handleDelete(store.id)}
                        onBlur={() => setDeleteId(null)}
                      >
                        {deleteId === store.id ? 'Confirmar?' : 'Excluir'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ── Tab: Reports ──────────────────────────────────────────────────────────────

const REPORT_TYPE_LABELS = {
  wrong_price: 'Preço incorreto',
  wrong_store: 'Loja incorreta',
  missing_info: 'Info faltando',
  other: 'Outro',
}

function ReportsTab() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showResolved, setShowResolved] = useState(false)
  const [resolving, setResolving] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await apiAdminListReports(showResolved ? null : false)
      setReports(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [showResolved])

  async function handleResolve(id) {
    setResolving(id)
    try {
      await apiAdminResolveReport(id)
      setReports(r => r.filter(x => x.id !== id))
    } catch {
      // ignore
    } finally {
      setResolving(null)
    }
  }

  if (loading) return <p className="admin-tab-loading">Carregando...</p>
  if (error)   return <p className="admin-tab-error">{error}</p>

  return (
    <div className="admin-tab-body">
      <div className="admin-tab-toolbar">
        <h2 className="admin-section-title">Reportes de dados incorretos</h2>
        <label className="admin-toggle-label">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
          />
          {' '}Mostrar resolvidos
        </label>
      </div>
      {reports.length === 0 ? (
        <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>Nenhum reporte pendente.</p>
      ) : (
        <div className="reports-list">
          {reports.map(r => (
            <div key={r.id} className={`report-card${r.resolved ? ' report-card--resolved' : ''}`}>
              <div className="report-card-head">
                <span className="report-type-badge">{REPORT_TYPE_LABELS[r.report_type] || r.report_type}</span>
                <span className="report-product">{r.product_title}</span>
                <span className="report-date">{new Date(r.created_at).toLocaleString('pt-BR')}</span>
              </div>
              <p className="report-description">{r.description}</p>
              {r.offer_url && (
                <a href={r.offer_url} target="_blank" rel="noopener noreferrer" className="report-url">{r.offer_url}</a>
              )}
              {(r.reporter_email || r.user_id) && (
                <p className="report-meta">
                  {r.reporter_email ? `Email: ${r.reporter_email}` : `Usuário ID: ${r.user_id}`}
                </p>
              )}
              {r.snapshot && (
                <pre className="report-snapshot">{JSON.stringify(r.snapshot, null, 2)}</pre>
              )}
              {!r.resolved && (
                <button
                  className="btn-sm btn-success"
                  onClick={() => handleResolve(r.id)}
                  disabled={resolving === r.id}
                >
                  {resolving === r.id ? 'Resolvendo…' : '✓ Marcar como resolvido'}
                </button>
              )}
              {r.resolved && <span className="report-resolved-badge">✓ Resolvido</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main AdminPage ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'users',    label: 'Usuários'  },
  { id: 'devtools', label: 'Dev Tools' },
  { id: 'cache',    label: 'Cache'     },
  { id: 'donate',   label: 'Doações'   },
  { id: 'stores',   label: 'Lojas'     },
  { id: 'reports',  label: 'Reportes'  },
]

export default function AdminPage({ onBack }) {
  const [tab, setTab] = useState('users')

  return (
    <div className="admin-page">
      <div className="admin-header">
        <button className="admin-back-btn" onClick={onBack}>&#8592; Voltar</button>
        <div className="admin-header-sep" />
        <span className="admin-header-title">Admin</span>
        <span className="admin-restricted-badge">restricted</span>
        <nav className="admin-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`admin-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="admin-tab-content">
        {tab === 'users'    && <UsersTab />}
        {tab === 'devtools' && <DevToolsTab />}
        {tab === 'cache'    && <CacheTab />}
        {tab === 'donate'   && <DonateTab />}
        {tab === 'stores'   && <StoresTab />}
        {tab === 'reports'  && <ReportsTab />}
      </div>
    </div>
  )
}
