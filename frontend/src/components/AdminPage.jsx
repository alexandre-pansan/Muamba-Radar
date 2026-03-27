import React, { useEffect, useState } from 'react'
import {
  apiFetchSources,
  apiTestSearch,
  apiRefreshCache,
  apiAdminListUsers,
  apiAdminDeleteUser,
  apiAdminToggleAdmin,
} from '../api.js'

// ── Shared ───────────────────────────────────────────────────────────────────

function AdminAdapterCard({ adapter }) {
  const timingColor =
    adapter.timing_ms > 5000 ? 'var(--danger)' : adapter.timing_ms > 2000 ? 'var(--warning)' : 'var(--muted)'
  const borderColor = adapter.error ? 'var(--danger-border)' : adapter.filtered_count > 0 ? 'var(--success-border)' : 'var(--line)'

  return (
    <div style={{
      background: 'var(--card)', border: `1px solid ${borderColor}`,
      borderRadius: '8px', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', background: 'var(--card-bg)',
        borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{adapter.adapter_id}</span>
        <span style={{
          fontSize: 11, padding: '1px 7px', borderRadius: 10, fontWeight: 600,
          ...(adapter.country === 'br'
            ? { background: 'var(--br-bg)', color: 'var(--success)', border: '1px solid var(--br-border)' }
            : { background: 'var(--py-bg)', color: 'var(--info)',    border: '1px solid var(--py-border)' }),
        }}>
          {adapter.country.toUpperCase()}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: timingColor }}>{adapter.timing_ms}ms</span>
      </div>
      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Raw <strong style={{ color: 'var(--text)' }}>{adapter.raw_count}</strong></span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Filtered <strong style={{ color: 'var(--success)' }}>{adapter.filtered_count}</strong></span>
        </div>
        {adapter.error && (
          <div style={{
            background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 5,
            padding: '8px 10px', fontFamily: 'monospace', fontSize: 12,
            color: 'var(--danger)', wordBreak: 'break-all', marginBottom: 8,
          }}>{adapter.error}</div>
        )}
        {adapter.sample_offers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {adapter.sample_offers.map((o, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '5px 8px', background: 'var(--card-bg)', borderRadius: 5, fontSize: 12,
              }}>
                <span style={{ flex: 1, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.title}>{o.title}</span>
                <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--success)' }}>
                  {o.currency} {o.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <a href={o.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)', textDecoration: 'none', fontSize: 11 }}>↗</a>
              </div>
            ))}
          </div>
        ) : !adapter.error ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>No results passed the filter.</p>
        ) : null}
      </div>
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

  if (loading) return <p style={{ color: 'var(--muted)', padding: 24 }}>Carregando...</p>
  if (error) return <p style={{ color: 'var(--danger)', padding: 24 }}>{error}</p>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>Usuários</h2>
        <span style={{
          background: 'var(--card-bg)', border: '1px solid var(--line)',
          borderRadius: 20, padding: '2px 10px', fontSize: 12, color: 'var(--muted)',
        }}>{users.length}</span>
        <button
          onClick={loadUsers}
          style={{
            marginLeft: 'auto', background: 'var(--card-bg)', border: '1px solid var(--line)',
            color: 'var(--muted)', padding: '5px 12px', borderRadius: 6,
            fontSize: 12, cursor: 'pointer',
          }}
        >
          Atualizar
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th className="col-id" style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>ID</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</th>
              <th className="col-name" style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nome</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Admin</th>
              <th className="col-date" style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Criado em</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td className="col-id" style={{ padding: '10px 12px', color: 'var(--muted)' }}>#{user.id}</td>
                <td style={{ padding: '10px 12px', color: 'var(--ink)', wordBreak: 'break-all' }}>{user.email}</td>
                <td className="col-name" style={{ padding: '10px 12px', color: 'var(--text)' }}>{user.name || '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  {user.is_admin ? (
                    <span style={{
                      background: 'var(--danger)', color: '#fff',
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 4,
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>Admin</span>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>—</span>
                  )}
                </td>
                <td className="col-date" style={{ padding: '10px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      disabled={busy === user.id}
                      onClick={() => handleToggleAdmin(user)}
                      style={{
                        background: 'var(--card-bg)', border: '1px solid var(--line)',
                        color: user.is_admin ? 'var(--warning)' : 'var(--info)',
                        padding: '4px 8px', borderRadius: 5,
                        fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {user.is_admin ? '−admin' : '+admin'}
                    </button>
                    <button
                      disabled={busy === user.id}
                      onClick={() => handleDelete(user)}
                      style={{
                        background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                        color: 'var(--danger)', padding: '4px 8px', borderRadius: 5,
                        fontSize: 11, cursor: 'pointer',
                      }}
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
      const data = await apiTestSearch(q, selected)
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
    <div style={{ padding: 32, color: 'var(--danger)' }}>
      <strong>Backend inacessível:</strong> {loadError}
      <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 13 }}>Verifique se o backend está rodando em localhost:8000</p>
    </div>
  )

  return (
    <div className="dev-tools-grid" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%', overflow: 'hidden' }}>
      {/* Left */}
      <div style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 10 }}>Test Search</p>
          <input
            type="text"
            placeholder="ex: iphone 15 128gb"
            value={testQuery}
            onChange={e => setTestQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRun()}
            style={{
              width: '100%', background: 'var(--card-bg)', border: '1px solid var(--line)',
              color: 'var(--ink)', padding: '8px 10px', borderRadius: 6,
              fontSize: 14, marginBottom: 8, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              width: '100%', background: running ? 'var(--line)' : 'var(--info)',
              color: '#fff', border: 'none', padding: '9px', borderRadius: 6,
              fontSize: 14, fontWeight: 600, cursor: running ? 'default' : 'pointer',
              opacity: running ? 0.7 : 1,
            }}
          >
            {running ? 'Rodando…' : 'Rodar busca'}
          </button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>Adapters</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {['Todos', 'Nenhum'].map((label, i) => (
              <button key={label} onClick={() => toggleAll(i === 0)} style={{
                flex: 1, background: 'var(--card-bg)', border: '1px solid var(--line)',
                color: 'var(--muted)', padding: '4px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px' }}>
          {Object.entries(byCountry).map(([country, group]) => {
            if (!group.length) return null
            return (
              <React.Fragment key={country}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', margin: '10px 0 6px' }}>
                  {country === 'br' ? 'Brasil' : 'Paraguai'}
                </p>
                {group.map(a => (
                  <label key={a.source} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!checked[a.source]} onChange={() => setChecked(prev => ({ ...prev, [a.source]: !prev[a.source] }))} style={{ accentColor: 'var(--info)' }} />
                    <span style={{ color: 'var(--text)', fontSize: 13 }}>{a.source}</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 11, padding: '1px 6px', borderRadius: 10, fontWeight: 600,
                      ...(country === 'br'
                        ? { background: 'var(--br-bg)', color: 'var(--success)', border: '1px solid var(--br-border)' }
                        : { background: 'var(--py-bg)', color: 'var(--info)',    border: '1px solid var(--py-border)' }),
                    }}>{country.toUpperCase()}</span>
                  </label>
                ))}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Resultados</p>
          {totalRaw != null && (
            <span style={{ background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: 'var(--muted)' }}>
              Raw <strong style={{ color: 'var(--ink)' }}>{totalRaw}</strong>
            </span>
          )}
          {totalFiltered != null && (
            <span style={{ background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: 'var(--muted)' }}>
              Filtrado <strong style={{ color: 'var(--success)' }}>{totalFiltered}</strong>
            </span>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 5, padding: '8px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--danger)' }}>{error}</div>
          )}
          {!results && !error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 15 }}>
              Rode uma busca para ver os resultados por adapter
            </div>
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
    <div style={{ padding: 32, maxWidth: 500 }}>
      <h2 style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600, marginBottom: 8 }}>Cache de Buscas</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
        Re-executa todas as buscas salvas no cache em background, atualizando os preços. Pode demorar alguns minutos.
      </p>
      <button
        onClick={handleRefresh}
        disabled={running}
        style={{
          background: running ? 'var(--line)' : 'var(--info)',
          color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 7,
          fontSize: 14, fontWeight: 600, cursor: running ? 'default' : 'pointer',
          opacity: running ? 0.7 : 1,
        }}
      >
        {running ? 'Iniciando…' : 'Atualizar cache agora'}
      </button>
      {status && (
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 7,
          background: status.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
          border: `1px solid ${status.ok ? 'var(--success-border)' : 'var(--danger-border)'}`,
          color: status.ok ? 'var(--success)' : 'var(--danger)',
          fontSize: 13,
        }}>{status.text}</div>
      )}
    </div>
  )
}

// ── Main AdminPage ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'users', label: 'Usuários' },
  { id: 'devtools', label: 'Dev Tools' },
  { id: 'cache', label: 'Cache' },
]

export default function AdminPage({ onBack }) {
  const [tab, setTab] = useState('users')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - var(--topbar-h, 52px))',
      marginTop: 'var(--topbar-h, 52px)',
      background: 'var(--card-bg)', color: 'var(--ink)',
      fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 14,
      overflow: 'hidden', maxWidth: '100vw',
    }}>
      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 24px', borderBottom: '1px solid var(--line)',
        background: 'var(--card)', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'var(--card-bg)', border: '1px solid var(--line)',
            color: 'var(--text)', cursor: 'pointer', fontSize: 12,
            padding: '5px 12px', borderRadius: 6,
            display: 'flex', alignItems: 'center', gap: 6,
            fontWeight: 500, transition: 'background 0.15s',
          }}
        >
          &#8592; Voltar
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--line)' }} />
        <span style={{ fontWeight: 700, fontSize: 15 }}>Admin</span>
        <span style={{
          background: 'var(--danger)', color: '#fff',
          fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 4,
          textTransform: 'uppercase', letterSpacing: 1,
        }}>restricted</span>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginLeft: 16 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === t.id ? 'var(--info)' : 'transparent'}`,
                color: tab === t.id ? 'var(--info)' : 'var(--muted)',
                padding: '16px 18px', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'users' && <UsersTab />}
        {tab === 'devtools' && <DevToolsTab />}
        {tab === 'cache' && <CacheTab />}
      </div>
    </div>
  )
}
