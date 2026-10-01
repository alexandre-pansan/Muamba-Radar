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

export function getRefreshToken() {
  return localStorage.getItem('muamba_refresh_token')
}

export function setRefreshToken(token) {
  localStorage.setItem('muamba_refresh_token', token)
}

export function clearToken() {
  localStorage.removeItem('muamba_token')
  localStorage.removeItem('muamba_refresh_token')
}

let _refreshing = null

async function refreshAccessToken() {
  const rt = getRefreshToken()
  if (!rt) return false
  try {
    const res = await fetch(`${getApiBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
    if (!res.ok) {
      if (res.status === 401) clearToken() // refresh token genuinely invalid/expired/revoked
      return false
    }
    const data = await res.json()
    setToken(data.access_token)
    setRefreshToken(data.refresh_token)
    return true
  } catch (_) {
    // network/backend unreachable — keep tokens, this was a transient failure, not a rejection
    return false
  }
}

async function fetchWithRefresh(url, options = {}) {
  let res = await fetch(url, options)
  if (res.status === 401 && getRefreshToken()) {
    if (!_refreshing) _refreshing = refreshAccessToken().finally(() => { _refreshing = null })
    const ok = await _refreshing
    if (ok) {
      const token = getToken()
      const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` }
      res = await fetch(url, { ...options, headers })
    }
  }
  return res
}

function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetchMe() {
  const token = getToken()
  if (!token && !getRefreshToken()) return null
  const res = await fetchWithRefresh(`${getApiBase()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}

export async function apiFetchPrefs() {
  const token = getToken()
  if (!token && !getRefreshToken()) return { show_margin: false }
  try {
    const res = await fetchWithRefresh(`${getApiBase()}/auth/me/prefs`, {
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
  const data = await res.json()
  if (data.refresh_token) setRefreshToken(data.refresh_token)
  return data
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
  const data = await res.json()
  if (data.refresh_token) setRefreshToken(data.refresh_token)
  return data
}

export async function apiLogout() {
  const rt = getRefreshToken()
  if (rt) {
    await fetch(`${getApiBase()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    }).catch(() => {})
  }
  clearToken()
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

export async function apiFetchTrending(limit = 8) {
  const res = await fetch(`${getApiBase()}/trending?limit=${limit}`)
  if (!res.ok) return []
  return res.json()
}

export async function apiFetchHighlights(limit = 8) {
  const res = await fetch(`${getApiBase()}/highlights?limit=${limit}`)
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

export async function apiRefreshCacheStatus() {
  const res = await fetch(`${getApiBase()}/admin/refresh-cache/status`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiRefreshCache() {
  const res = await fetch(`${getApiBase()}/admin/refresh-cache`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminCrawlerStatus() {
  const res = await fetch(`${getApiBase()}/admin/crawler/status`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminCrawlerStart() {
  const res = await fetch(`${getApiBase()}/admin/crawler/start`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminCrawlerStop() {
  const res = await fetch(`${getApiBase()}/admin/crawler/stop`, {
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

export async function apiFetchConfig() {
  try {
    const res = await fetch(`${getApiBase()}/config`)
    if (res.ok) return res.json()
  } catch (_) {}
  return { beta_notice_version: 1 }
}

export async function apiAdminUpdateBetaNoticeText(data) {
  const res = await fetch(`${getApiBase()}/admin/beta-notice/text`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiBumpBetaNotice() {
  const res = await fetch(`${getApiBase()}/admin/beta-notice/bump`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminUpdateDonateStats(data) {
  const res = await fetch(`${getApiBase()}/admin/donate-stats`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Cart ─────────────────────────────────────────────────────────────────────

export async function apiFetchCart() {
  const res = await fetchWithRefresh(`${getApiBase()}/cart`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) return []
  return res.json()
}

export async function apiAddToCart(item) {
  const res = await fetchWithRefresh(`${getApiBase()}/cart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(item),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiRemoveFromCart(itemId) {
  const res = await fetchWithRefresh(`${getApiBase()}/cart/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function apiClearCart() {
  const res = await fetchWithRefresh(`${getApiBase()}/cart`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function apiFetchCartGrouped() {
  const res = await fetchWithRefresh(`${getApiBase()}/cart/grouped`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) return []
  return res.json()
}

export async function apiFetchCartCoupons() {
  const res = await fetchWithRefresh(`${getApiBase()}/cart/coupons`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) return []
  return res.json()
}

// ── Favorites (logged-in only — anonymous favorites stay in localStorage) ─────

export async function apiFetchFavorites() {
  const res = await fetchWithRefresh(`${getApiBase()}/favorites`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) return []
  return res.json()
}

export async function apiAddFavorite(item) {
  const res = await fetchWithRefresh(`${getApiBase()}/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(item),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiRemoveFavorite(itemId) {
  const res = await fetchWithRefresh(`${getApiBase()}/favorites/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Seller / Lojista ────────────────────────────────────────────────────────

async function sellerFetch(path, options = {}) {
  const res = await fetchWithRefresh(`${getApiBase()}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const e = new Error(err.detail || `HTTP ${res.status}`)
    e.status = res.status
    throw e
  }
  return res.status === 204 ? null : res.json()
}

export async function apiGetSellerProfile() {
  try {
    return await sellerFetch('/seller/profile')
  } catch (err) {
    if (err.message.includes('404')) return null
    throw err
  }
}

export async function apiCreateSellerProfile(storeName) {
  return sellerFetch('/seller/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_name: storeName }),
  })
}

export async function apiSellerStoreSuggestions(q) {
  return sellerFetch(`/seller/store-suggestions?q=${encodeURIComponent(q)}`)
}

export async function apiGetSellerOffers() {
  return sellerFetch('/seller/offers')
}

export async function apiGetSellerMetrics() {
  return sellerFetch('/seller/metrics')
}

export async function apiListSellerHighlights() {
  return sellerFetch('/seller/highlights')
}

export async function apiCreateSellerHighlight(body) {
  return sellerFetch('/seller/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function apiRemoveSellerHighlight(id) {
  return sellerFetch(`/seller/highlights/${id}`, { method: 'DELETE' })
}

export async function apiUnlockSellerHighlight(id) {
  return sellerFetch(`/seller/highlights/${id}/unlock`, { method: 'POST' })
}

export async function apiListSellerCoupons() {
  return sellerFetch('/seller/coupons')
}

export async function apiCreateSellerCoupon(body) {
  return sellerFetch('/seller/coupons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function apiDeleteSellerCoupon(id) {
  return sellerFetch(`/seller/coupons/${id}`, { method: 'DELETE' })
}

export async function apiListSellerBanners() {
  return sellerFetch('/seller/banners')
}

export async function apiCreateSellerBanner(body) {
  return sellerFetch('/seller/banners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function apiDeleteSellerBanner(id) {
  return sellerFetch(`/seller/banners/${id}`, { method: 'DELETE' })
}

// ── Billing (Mercado Pago) — real payment, backend Phase 3. sellerFetch() attaches
// `.status` to thrown errors so callers can special-case 503 "não configurado ainda"
// and fall back to the Phase 6 lead-capture flow instead of showing a raw error. ────

export async function apiBillingStatus() {
  const res = await fetch(`${getApiBase()}/billing/status`)
  if (!res.ok) return { enabled: false }
  return res.json()
}

export async function apiBillingSubscribe(planTier) {
  return sellerFetch('/billing/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_tier: planTier }),
  })
}

export async function apiBillingSubscriptionStatus() {
  return sellerFetch('/billing/subscription')
}

export async function apiBillingCancel() {
  return sellerFetch('/billing/cancel', { method: 'POST' })
}

// ── Admin: Sellers ──────────────────────────────────────────────────────────

export async function apiAdminListSellers() {
  const res = await fetch(`${getApiBase()}/admin/sellers`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminUpdateSeller(sellerId, data) {
  const res = await fetch(`${getApiBase()}/admin/sellers/${sellerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Admin: Stores ─────────────────────────────────────────────────────────────

export async function apiAdminListStores() {
  const res = await fetch(`${getApiBase()}/admin/stores`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminCreateStore(data) {
  const res = await fetch(`${getApiBase()}/admin/stores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiAdminUpdateStore(storeId, data) {
  const res = await fetch(`${getApiBase()}/admin/stores/${storeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiAdminDeleteStore(storeId) {
  const res = await fetch(`${getApiBase()}/admin/stores/${storeId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function apiAdminUploadStorePhoto(storeId, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${getApiBase()}/admin/stores/${storeId}/photo`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiAdminUnmatchedStores() {
  const res = await fetch(`${getApiBase()}/admin/stores/unmatched`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminMapsSearch(name) {
  const res = await fetch(
    `${getApiBase()}/admin/maps-search?q=${encodeURIComponent(name)}`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminExportStores() {
  const res = await fetch(`${getApiBase()}/admin/stores/export`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminImportStores(stores) {
  const res = await fetch(`${getApiBase()}/admin/stores/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(stores),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiSubmitReport(body) {
  const res = await fetch(`${getApiBase()}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiAdminListReports(resolved = null) {
  const params = resolved !== null ? `?resolved=${resolved}` : ''
  const res = await fetch(`${getApiBase()}/admin/reports${params}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiAdminResolveReport(reportId, adminNotes = null) {
  const res = await fetch(`${getApiBase()}/admin/reports/${reportId}/resolve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ admin_notes: adminNotes }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
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

export async function apiAdminSearchHistory(limit = 200) {
  const res = await fetch(`${getApiBase()}/admin/search-history?limit=${limit}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
