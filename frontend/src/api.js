// Centralized API calls for MAMU frontend

export function getApiBase() {
  if (typeof window.__MUAMBA_API__ === 'string' && window.__MUAMBA_API__) {
    return window.__MUAMBA_API__.replace(/\/+$/, '')
  }
  return '' // works via Vite proxy in dev, or nginx proxy in Docker
}

export function getToken() {
  return localStorage.getItem('muamba_token')
}

export function setToken(token) {
  localStorage.setItem('muamba_token', token)
}

export function clearToken() {
  localStorage.removeItem('muamba_token')
}

function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetchMe() {
  const token = getToken()
  if (!token) return null
  const res = await fetch(`${getApiBase()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}

export async function apiFetchPrefs() {
  const token = getToken()
  if (!token) return { show_margin: false }
  try {
    const res = await fetch(`${getApiBase()}/auth/me/prefs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return res.json()
  } catch (_) {}
  return { show_margin: false }
}

export async function apiSavePrefs(updates) {
  const res = await fetch(`${getApiBase()}/auth/me/prefs`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiLogin(identifier, password) {
  const res = await fetch(`${getApiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Login failed.')
  }
  return res.json()
}

export async function apiRegister(username, name, email, password) {
  const res = await fetch(`${getApiBase()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, name: name || undefined, email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Registration failed.')
  }
  return res.json()
}

export async function apiUpdateMe(updates) {
  const res = await fetch(`${getApiBase()}/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Save failed.')
  }
  return res.json()
}

export async function apiFetchUserSearches() {
  const res = await fetch(`${getApiBase()}/auth/me/searches`, {
    headers: authHeaders(),
  })
  if (!res.ok) return []
  return res.json()
}

export async function apiCompare(query, sort) {
  const url = new URL(`${getApiBase()}/compare`, window.location.href)
  url.searchParams.set('q', query)
  url.searchParams.set('country', 'all')
  url.searchParams.set('sort', sort)
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const cacheHeader = res.headers.get('X-Cache')
  return { data, stale: cacheHeader === 'FALLBACK' }
}

export async function apiFetchSuggestions(q) {
  const url = new URL(`${getApiBase()}/suggestions`, window.location.href)
  url.searchParams.set('q', q)
  const res = await fetch(url)
  if (!res.ok) return []
  return res.json()
}

export async function apiFetchFxRate() {
  try {
    const res = await fetch(`${getApiBase()}/fx`)
    if (res.ok) {
      const data = await res.json()
      return data.brl_per_usd
    }
  } catch (_) {}
  return null
}

export async function apiFetchFeaturedImages() {
  try {
    const res = await fetch(`${getApiBase()}/featured-images`)
    if (res.ok) return res.json()
  } catch (_) {}
  return []
}

export async function apiRefreshCache() {
  const res = await fetch(`${getApiBase()}/admin/refresh-cache`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiFetchSources() {
  const res = await fetch(`${getApiBase()}/sources`)
  if (!res.ok) return []
  return res.json()
}

export async function apiAdminListUsers() {
  const res = await fetch(`${getApiBase()}/admin/users`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminDeleteUser(userId) {
  const res = await fetch(`${getApiBase()}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

export async function apiAdminToggleAdmin(userId) {
  const res = await fetch(`${getApiBase()}/admin/users/${userId}/toggle-admin`, {
    method: 'PATCH',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

export async function apiTestSearch(query, adapterIds, raw = false) {
  const res = await fetch(`${getApiBase()}/admin/test-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ query, adapter_ids: adapterIds, raw }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}
