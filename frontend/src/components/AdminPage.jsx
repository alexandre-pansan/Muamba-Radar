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
    adapter.timing_ms > 5000 ? '#e55' : adapter.timing_ms > 2000 ? '#e5a244' : '#555'
  const borderColor = adapter.error ? '#5a1a1a' : adapter.filtered_count > 0 ? '#1a3a1a' : '#222'

  return (
    <div style={{
      background: '#111', border: `1px solid ${borderColor}`,
      borderRadius: '8px', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', background: '#151515',
        borderBottom: '1px solid #1e1e1e',
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#e0e0e0' }}>{adapter.adapter_id}</span>
        <span style={{
          fontSize: 11, padding: '1px 7px', borderRadius: 10, fontWeight: 600,
          ...(adapter.country === 'br'
            ? { background: '#1a3a1a', color: '#4caf50' }
            : { background: '#1a2a3a', color: '#5a9cf8' }),
        }}>
          {adapter.country.toUpperCase()}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: timingColor }}>{adapter.timing_ms}ms</span>
      </div>
      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#777' }}>Raw <strong style={{ color: '#aaa' }}>{adapter.raw_count}</strong></span>
          <span style={{ fontSize: 12, color: '#777' }}>Filtered <strong style={{ color: '#4caf50' }}>{adapter.filtered_count}</strong></span>
        </div>
        {adapter.error && (
          <div style={{
            background: '#1a0a0a', border: '1px solid #5a1a1a', borderRadius: 5,
            padding: '8px 10px', fontFamily: 'monospace', fontSize: 12,
            color: '#e55', wordBreak: 'break-all', marginBottom: 8,
          }}>{adapter.error}</div>
        )}
        {adapter.sample_offers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {adapter.sample_offers.map((o, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '5px 8px', background: '#0d0d0d', borderRadius: 5, fontSize: 12,
              }}>
                <span style={{ flex: 1, color: '#bbb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.title}>{o.title}</span>
                <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: '#4caf50' }}>
                  {o.currency} {o.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <a href={o.url} target="_blank" rel="noopener noreferrer" style={{ color: '#5a9cf8', textDecoration: 'none', fontSize: 11 }}>↗</a>
              </div>
            ))}
          </div>
        ) : !adapter.error ? (
          <p style={{ color: '#444', fontSize: 13, fontStyle: 'italic' }}>No results passed the filter.</p>
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
  const [busy, setBusy] = useState(null) // userId being actioned

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

  if (loading) return <p style={{ color: '#555', padding: 24 }}>Carregando...</p>
  if (error) return <p style={{ color: '#e55', padding: 24 }}>{error}</p>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, color: '#e0e0e0', fontWeight: 600 }}>Usuários</h2>
        <span style={{
          background: '#1a1a1a', border: '1px solid #333',
          borderRadius: 20, padding: '2px 10px', fontSize: 12, color: '#777',
        }}>{users.length}</span>
        <button
          onClick={loadUsers}
          style={{
            marginLeft: 'auto', background: '#1a1a1a', border: '1px solid #333',
            color: '#aaa', padding: '5px 12px', borderRadius: 6,
            fontSize: 12, cursor: 'pointer',
          }}
        >
          Atualizar
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #222' }}>
              {['ID', 'Email', 'Nome', 'Admin', 'Criado em', 'Ações'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '8px 12px',
                  color: '#555', fontWeight: 600, fontSize: 11,
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                <td style={{ padding: '10px 12px', color: '#555' }}>#{user.id}</td>
                <td style={{ padding: '10px 12px', color: '#e0e0e0' }}>{user.email}</td>
                <td style={{ padding: '10px 12px', color: '#aaa' }}>{user.name || '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  {user.is_admin ? (
                    <span style={{
                      background: '#c00', color: '#fff',
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 4,
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>Admin</span>
                  ) : (
                    <span style={{ color: '#444' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '10px 12px', color: '#555', whiteSpace: 'nowrap' }}>
                  {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      disabled={busy === user.id}
                      onClick={() => handleToggleAdmin(user)}
                      style={{
                        background: '#1a1a1a', border: '1px solid #333',
                        color: user.is_admin ? '#e5a244' : '#5a9cf8',
                        padding: '4px 10px', borderRadius: 5,
                        fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {user.is_admin ? 'Remover admin' : 'Tornar admin'}
                    </button>
                    <button
                      disabled={busy === user.id}
                      onClick={() => handleDelete(user)}
                      style={{
                        background: '#1a0a0a', border: '1px solid #5a1a1a',
                        color: '#e55', padding: '4px 10px', borderRadius: 5,
                        fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      Deletar
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
    <div style={{ padding: 32, color: '#e55' }}>
      <strong>Backend inacessível:</strong> {loadError}
      <p style={{ color: '#666', marginTop: 8, fontSize: 13 }}>Verifique se o backend está rodando em localhost:8000</p>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%', overflow: 'hidden' }}>
      {/* Left */}
      <div style={{ borderRight: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid #1e1e1e' }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 10 }}>Test Search</p>
          <input
            type="text"
            placeholder="ex: iphone 15 128gb"
            value={testQuery}
            onChange={e => setTestQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRun()}
            style={{
              width: '100%', background: '#1a1a1a', border: '1px solid #333',
              color: '#e0e0e0', padding: '8px 10px', borderRadius: 6,
              fontSize: 14, marginBottom: 8, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              width: '100%', background: running ? '#333' : '#5a9cf8',
              color: '#fff', border: 'none', padding: '9px', borderRadius: 6,
              fontSize: 14, fontWeight: 600, cursor: running ? 'default' : 'pointer',
              opacity: running ? 0.7 : 1,
            }}
          >
            {running ? 'Rodando…' : 'Rodar busca'}
          </button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e1e' }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 8 }}>Adapters</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {['Todos', 'Nenhum'].map((label, i) => (
              <button key={label} onClick={() => toggleAll(i === 0)} style={{
                flex: 1, background: '#1e1e1e', border: '1px solid #333',
                color: '#aaa', padding: '4px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px' }}>
          {Object.entries(byCountry).map(([country, group]) => {
            if (!group.length) return null
            return (
              <React.Fragment key={country}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#444', margin: '10px 0 6px' }}>
                  {country === 'br' ? 'Brasil' : 'Paraguai'}
                </p>
                {group.map(a => (
                  <label key={a.source} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!checked[a.source]} onChange={() => setChecked(prev => ({ ...prev, [a.source]: !prev[a.source] }))} style={{ accentColor: '#5a9cf8' }} />
                    <span style={{ color: '#ccc', fontSize: 13 }}>{a.source}</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 11, padding: '1px 6px', borderRadius: 10, fontWeight: 600,
                      ...(country === 'br' ? { background: '#1a3a1a', color: '#4caf50' } : { background: '#1a2a3a', color: '#5a9cf8' }),
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
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#888' }}>Resultados</p>
          {totalRaw != null && (
            <span style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: '#aaa' }}>
              Raw <strong style={{ color: '#e0e0e0' }}>{totalRaw}</strong>
            </span>
          )}
          {totalFiltered != null && (
            <span style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: '#aaa' }}>
              Filtrado <strong style={{ color: '#4caf50' }}>{totalFiltered}</strong>
            </span>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ background: '#1a0a0a', border: '1px solid #5a1a1a', borderRadius: 5, padding: '8px 10px', fontFamily: 'monospace', fontSize: 12, color: '#e55' }}>{error}</div>
          )}
          {!results && !error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: 15 }}>
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
      <h2 style={{ fontSize: 16, color: '#e0e0e0', fontWeight: 600, marginBottom: 8 }}>Cache de Buscas</h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
        Re-executa todas as buscas salvas no cache em background, atualizando os preços. Pode demorar alguns minutos.
      </p>
      <button
        onClick={handleRefresh}
        disabled={running}
        style={{
          background: running ? '#333' : '#5a9cf8',
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
          background: status.ok ? '#0d1a0d' : '#1a0a0a',
          border: `1px solid ${status.ok ? '#1a3a1a' : '#5a1a1a'}`,
          color: status.ok ? '#4caf50' : '#e55',
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
      background: '#0d0d0d', color: '#e0e0e0',
      fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 14,
      overflow: 'hidden',
    }}>
      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 24px', borderBottom: '1px solid #1e1e1e',
        background: '#111', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: '#1a1a1a', border: '1px solid #2a2a2a',
            color: '#ccc', cursor: 'pointer', fontSize: 12,
            padding: '5px 12px', borderRadius: 6,
            display: 'flex', alignItems: 'center', gap: 6,
            fontWeight: 500, transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#242424'}
          onMouseLeave={e => e.currentTarget.style.background = '#1a1a1a'}
        >
          &#8592; Voltar
        </button>
        <div style={{ width: 1, height: 20, background: '#2a2a2a' }} />
        <span style={{ fontWeight: 700, fontSize: 15 }}>Admin</span>
        <span style={{
          background: '#c00', color: '#fff',
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
                background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? '#5a9cf8' : 'transparent'}`,
                color: tab === t.id ? '#5a9cf8' : '#666',
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
