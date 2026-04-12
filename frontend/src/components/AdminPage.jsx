import React, { useEffect, useState } from 'react'
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
} from '../api.js'

// ── Shared ───────────────────────────────────────────────────────────────────

const PREVIEW_COUNT = 3

function RawOffersModal({ adapter, onClose }) {
  return (
    <div className="raw-modal-backdrop" onClick={onClose}>
      <div className="raw-modal" onClick={e => e.stopPropagation()}>
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

  async function handleRefresh() {
    setRunning(true)
    setStatus(null)
    try {
      const data = await apiRefreshCache()
      setStatus({ ok: true, text: `Iniciado! ${data.unique_queries} queries sendo re-scrapeadas em background.` })
    } catch (e) {
      setStatus({ ok: false, text: e.message })
    } finally {
      setRunning(false)
    }
  }

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
        {running ? 'Iniciando…' : 'Atualizar cache agora'}
      </button>
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

// ── Main AdminPage ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'users',    label: 'Usuários'  },
  { id: 'devtools', label: 'Dev Tools' },
  { id: 'cache',    label: 'Cache'     },
  { id: 'donate',   label: 'Doações'   },
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
      </div>
    </div>
  )
}
