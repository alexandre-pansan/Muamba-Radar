import React, { useState, useEffect, useCallback, useRef } from 'react'
import { I18nProvider, useI18n } from './i18n.jsx'
import Header from './components/Header.jsx'
import Sidebar from './components/Sidebar.jsx'
import ResultsArea from './components/ResultsArea.jsx'
import AuthModal from './components/AuthModal.jsx'
import UserConfigModal from './components/UserConfigModal.jsx'
import AdminPage from './components/AdminPage.jsx'
import OffersDialog from './components/OffersDialog.jsx'
import {
  getToken, setToken, clearToken,
  apiFetchMe, apiFetchPrefs, apiFetchFeaturedImages,
  apiFetchUserSearches, apiCompare, apiSavePrefs,
} from './api.js'

const RECENT_KEY = 'muamba_recent'
const RECENT_MAX = 8

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('muamba_theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('muamba_theme', theme)
  }, [theme])
  const toggle = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), [])
  return [theme, toggle]
}

function AppInner() {
  const { t } = useI18n()
  const [theme, toggleTheme] = useTheme()

  // Auth state
  const [currentUser, setCurrentUser] = useState(null)
  const [currentPrefs, setCurrentPrefs] = useState({ show_margin: false })

  // Search / results state
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('best_match')
  const [lastData, setLastData] = useState(null)
  const [lastQuery, setLastQuery] = useState(null)
  const [status, setStatus] = useState(null) // {text, isError}
  const [isLoading, setIsLoading] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const [viewMode, setViewMode] = useState('card') // 'card' | 'table'
  const [groupOrder, setGroupOrder] = useState('estimated_asc')
  const [targetMargin, setTargetMargin] = useState(20)

  // Featured images for loading scene
  const [featuredImages, setFeaturedImages] = useState([])

  // Recent searches
  const [recentSearches, setRecentSearches] = useState([])

  // Modal open state
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalTab, setAuthModalTab] = useState('login')
  const [userConfigOpen, setUserConfigOpen] = useState(false)

  // Page routing
  const [page, setPage] = useState(() => window.location.pathname === '/admin' ? 'admin' : 'home')

  useEffect(() => {
    const handler = () => setPage(window.location.pathname === '/admin' ? 'admin' : 'home')
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  function goAdmin() {
    history.pushState(null, '', '/admin')
    setPage('admin')
  }

  function goHome() {
    history.pushState(null, '', '/')
    setPage('home')
  }

  // Sidebar mobile open
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Offers dialog
  const [offersGroup, setOffersGroup] = useState(null) // {group, name, config}

  // ── Auth ────────────────────────────────────────────────────────────────────

  const loadUserData = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setCurrentUser(null)
      setCurrentPrefs({ show_margin: false })
      loadLocalRecents()
      return
    }
    try {
      const user = await apiFetchMe()
      if (!user) {
        clearToken()
        setCurrentUser(null)
        setCurrentPrefs({ show_margin: false })
        loadLocalRecents()
        return
      }
      setCurrentUser(user)
      const prefs = await apiFetchPrefs()
      setCurrentPrefs(prefs)
      // Load user searches for sidebar
      loadUserSearches()
    } catch (_) {
      clearToken()
      setCurrentUser(null)
      setCurrentPrefs({ show_margin: false })
      loadLocalRecents()
    }
  }, [])

  function loadLocalRecents() {
    try {
      const items = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      setRecentSearches(items)
    } catch {
      setRecentSearches([])
    }
  }

  async function loadUserSearches() {
    try {
      const data = await apiFetchUserSearches()
      setRecentSearches(data.map(s => s.query))
    } catch (_) {}
  }

  function handleLogout() {
    clearToken()
    setCurrentUser(null)
    setCurrentPrefs({ show_margin: false })
    loadLocalRecents()
  }

  function handleLoginSuccess(token) {
    setToken(token)
    setAuthModalOpen(false)
    loadUserData()
  }

  function handleRegisterSuccess(token) {
    setToken(token)
    setAuthModalOpen(false)
    loadUserData()
  }

  function openAuthModal(tab = 'login') {
    setAuthModalTab(tab)
    setAuthModalOpen(true)
  }

  function handleUserUpdate(user) {
    setCurrentUser(user)
  }

  async function handlePrefChange(updates) {
    try {
      const newPrefs = await apiSavePrefs(updates)
      setCurrentPrefs(newPrefs)
    } catch (_) {}
  }

  // ── Featured images ─────────────────────────────────────────────────────────

  useEffect(() => {
    apiFetchFeaturedImages().then(imgs => {
      if (imgs && imgs.length) setFeaturedImages(imgs)
    })
  }, [])

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    loadUserData()
  }, []) // eslint-disable-line

  // ── Search ──────────────────────────────────────────────────────────────────

  async function runCompare(searchQuery) {
    const q = (searchQuery ?? query).trim()
    if (!q) {
      setStatus({ text: t('status.type_first'), isError: true })
      return
    }
    setLastQuery(q)
    setIsLoading(true)
    setIsStale(false)
    setStatus({ text: t('status.comparing'), isError: false })

    // Close mobile sidebar
    setSidebarOpen(false)

    try {
      const { data, stale } = await apiCompare(q, sort)
      setLastData(data)
      setIsStale(stale)

      if (!data.groups || data.groups.length === 0) {
        setStatus({ text: t('status.no_results'), isError: false })
      } else {
        setStatus({ text: t('status.found', { n: data.groups.length }), isError: false })
      }

      saveRecentSearch(q)

      // Refresh images in background
      apiFetchFeaturedImages().then(imgs => {
        if (imgs && imgs.length) setFeaturedImages(imgs)
      })
    } catch (err) {
      setStatus({ text: t('status.compare_failed', { msg: err.message }), isError: true })
    } finally {
      setIsLoading(false)
    }
  }

  function handleRetry() {
    if (lastQuery) {
      setQuery(lastQuery)
      runCompare(lastQuery)
    }
  }

  function handleClear() {
    setLastData(null)
    setLastQuery(null)
    setQuery('')
    setIsStale(false)
    setStatus({ text: t('status.ready'), isError: false })
  }

  function saveRecentSearch(q) {
    if (!q) return
    if (currentUser) {
      // Server saves automatically; refresh sidebar
      loadUserSearches()
    } else {
      let recents
      try {
        recents = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      } catch {
        recents = []
      }
      recents = [q, ...recents.filter(r => r !== q)].slice(0, RECENT_MAX)
      localStorage.setItem(RECENT_KEY, JSON.stringify(recents))
      setRecentSearches(recents)
    }
  }

  function handleRecentClick(q) {
    setQuery(q)
    runCompare(q)
    setSidebarOpen(false)
  }

  // ── Offers dialog ───────────────────────────────────────────────────────────

  function openOffersDialog(group, name, config) {
    setOffersGroup({ group, name, config })
  }

  function closeOffersDialog() {
    setOffersGroup(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const showMargin = currentUser && (currentPrefs?.show_margin ?? false)

  return (
    <>
      <Header
        currentUser={currentUser}
        onOpenAuth={openAuthModal}
        onLogout={handleLogout}
        onOpenSettings={() => setUserConfigOpen(true)}
        onOpenAdmin={goAdmin}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {page === 'admin' ? (
        <AdminPage onBack={goHome} />
      ) : (
      <>
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="app-shell">
        <Sidebar
          isOpen={sidebarOpen}
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          onSearch={(q) => runCompare(q)}
          showMargin={showMargin}
          targetMargin={targetMargin}
          onMarginChange={setTargetMargin}
          recentSearches={recentSearches}
          onRecentClick={handleRecentClick}
          currentUser={currentUser}
        />

        <div className="main-area">
          <ResultsArea
            isLoading={isLoading}
            lastData={lastData}
            lastQuery={lastQuery}
            status={status}
            isStale={isStale}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            groupOrder={groupOrder}
            onGroupOrderChange={setGroupOrder}
            targetMargin={targetMargin}
            showMargin={showMargin}
            onRetry={handleRetry}
            onClear={handleClear}
            featuredImages={featuredImages}
            onOpenOffers={openOffersDialog}
          />
          <footer className="app-footer">
            <span>© {new Date().getFullYear()} MuambaRadar — Comparador de Preços PY &amp; BR</span>
            <span className="app-footer-sep">·</span>
            <span>Todos os direitos reservados</span>
            <span className="app-footer-sep">·</span>
            <span>Os preços são coletados em tempo real e podem variar</span>
          </footer>
        </div>
      </div>

      <AuthModal
        open={authModalOpen}
        tab={authModalTab}
        onTabChange={setAuthModalTab}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        onRegisterSuccess={handleRegisterSuccess}
      />

      <UserConfigModal
        open={userConfigOpen}
        onClose={() => setUserConfigOpen(false)}
        currentUser={currentUser}
        currentPrefs={currentPrefs}
        onUserUpdate={handleUserUpdate}
        onPrefChange={handlePrefChange}
        onSearchClick={(q) => {
          setUserConfigOpen(false)
          setQuery(q)
          runCompare(q)
        }}
      />

      {offersGroup && (
        <OffersDialog
          group={offersGroup.group}
          name={offersGroup.name}
          config={offersGroup.config}
          onClose={closeOffersDialog}
        />
      )}

      </>
      )}

    </>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  )
}
