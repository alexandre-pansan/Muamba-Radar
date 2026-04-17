import React, { useState, useEffect, useCallback, useRef } from 'react'
import { I18nProvider, useI18n } from './i18n.jsx'

function MobileSearchBar({ query, onQueryChange, sort, onSortChange, onSearch }) {
  const { t } = useI18n()
  return (
    <div className="mobile-search-bar">
      <div className="msb-row">
        <input
          className="msb-input"
          type="text"
          placeholder={t('search.placeholder')}
          autoComplete="off"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch(query)}
        />
        <select
          className="msb-select"
          value={sort}
          onChange={e => onSortChange(e.target.value)}
          aria-label={t('search.sort_label')}
        >
          <option value="best_match">{t('search.sort_best')}</option>
          <option value="lowest_price">{t('search.sort_lowest')}</option>
        </select>
      </div>
      <button className="msb-btn" onClick={() => onSearch(query)}>
        {t('search.btn')}
      </button>
    </div>
  )
}
import Header from './components/Header.jsx'
import Sidebar from './components/Sidebar.jsx'
import ResultsArea from './components/ResultsArea.jsx'
import AuthModal from './components/AuthModal.jsx'
import UserConfigModal from './components/UserConfigModal.jsx'
import AdminPage from './components/AdminPage.jsx'
import PrivacyPage from './components/PrivacyPage.jsx'
import TermsPage from './components/TermsPage.jsx'
import TaxCalculator from './components/TaxCalculator.jsx'
import OffersDialog from './components/OffersDialog.jsx'
import BetaNoticeModal, { shouldShowBetaNotice } from './components/BetaNoticeModal.jsx'
import DonateModal from './components/DonateModal.jsx'
import CartPage from './components/CartPage.jsx'
import { CartProvider, useCart } from './CartContext.jsx'
import {
  getToken, setToken, clearToken, apiLogout,
  apiFetchMe, apiFetchPrefs, apiFetchFeaturedImages,
  apiFetchUserSearches, apiCompare, apiSavePrefs, apiFetchConfig,
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

function AppShell({ currentUser, setCurrentUser }) {
  const { t } = useI18n()
  const [theme, toggleTheme] = useTheme()
  const { items: cartItems } = useCart()

  // Auth state (currentUser + setCurrentUser come from parent via props)
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
  const [taxCalcOpen, setTaxCalcOpen] = useState(false)
  const [betaNoticeOpen, setBetaNoticeOpen] = useState(false)
  const [donateOpen, setDonateOpen] = useState(false)
  const [betaVersion, setBetaVersion] = useState(1)
  const [betaTitle, setBetaTitle] = useState('')
  const [betaBody1, setBetaBody1] = useState('')
  const [betaBody2, setBetaBody2] = useState('')
  const [donateGoal, setDonateGoal] = useState(80)
  const [donateRaised, setDonateRaised] = useState(0)
  const [donateSupporters, setDonateSupporters] = useState(0)

  // Page routing
  const getPage = () => {
    const p = window.location.pathname
    if (p === '/admin') return 'admin'
    if (p === '/cart') return 'cart'
    return 'home'
  }
  const [page, setPage] = useState(getPage)

  useEffect(() => {
    const handler = () => setPage(getPage())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  function goAdmin() {
    history.pushState(null, '', '/admin')
    setPage('admin')
  }

  function goCart() {
    history.pushState(null, '', '/cart')
    setPage('cart')
  }

  function goHome() {
    history.pushState(null, '', '/')
    setPage('home')
  }

  // Legal modals
  const [legalModal, setLegalModal] = useState(null) // 'privacy' | 'terms' | null

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
      const [prefs, config] = await Promise.all([apiFetchPrefs(), apiFetchConfig()])
      setCurrentPrefs(prefs)
      const v = config.beta_notice_version ?? 1
      setBetaVersion(v)
      setBetaTitle(config.beta_notice_title ?? '')
      setBetaBody1(config.beta_notice_body1 ?? '')
      setBetaBody2(config.beta_notice_body2 ?? '')
      setDonateGoal(config.donate_goal ?? 80)
      setDonateRaised(config.donate_raised ?? 0)
      setDonateSupporters(config.donate_supporters ?? 0)
      if (shouldShowBetaNotice({ user, prefs, version: v })) setBetaNoticeOpen(true)
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
    if (shouldShowBetaNotice({ user: null, prefs: null, version: betaVersion })) {
      setBetaNoticeOpen(true)
    }
  }

  async function loadUserSearches() {
    try {
      const data = await apiFetchUserSearches()
      setRecentSearches(data.map(s => s.query))
    } catch (_) {}
  }

  function handleLogout() {
    apiLogout()
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

  // ── Donate config (public, no auth needed) ──────────────────────────────────

  useEffect(() => {
    apiFetchConfig().then(cfg => {
      setDonateGoal(cfg.donate_goal ?? 80)
      setDonateRaised(cfg.donate_raised ?? 0)
      setDonateSupporters(cfg.donate_supporters ?? 0)
      setBetaVersion(cfg.beta_notice_version ?? 1)
      setBetaTitle(cfg.beta_notice_title ?? '')
      setBetaBody1(cfg.beta_notice_body1 ?? '')
      setBetaBody2(cfg.beta_notice_body2 ?? '')
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
        onOpenCalc={() => setTaxCalcOpen(true)}
        onOpenCart={goCart}
        cartCount={cartItems.length}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onGoHome={goHome}
      />

      {page === 'admin' ? (
        <AdminPage onBack={goHome} />
      ) : page === 'cart' ? (
        <CartPage onBack={goHome} />
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
          onDonate={() => setDonateOpen(true)}
          donateGoal={donateGoal}
          donateRaised={donateRaised}
          donateSupporters={donateSupporters}
        />

        <div className="main-area">
          <MobileSearchBar
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
            onSearch={runCompare}
          />
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
            onNeedAuth={() => openAuthModal('login')}
          />
          <footer className="app-footer">
            <span>© {new Date().getFullYear()} MuambaRadar — Comparador de preços informativo. Não vendemos produtos.</span>
            <span className="app-footer-sep">·</span>
            <span>Importações do Paraguai sujeitas à Receita Federal (isenção até USD 500/viagem).</span>
            <span className="app-footer-sep">·</span>
            <button className="app-footer-link" onClick={() => setLegalModal('privacy')}>Privacidade</button>
            <span className="app-footer-sep">·</span>
            <button className="app-footer-link" onClick={() => setLegalModal('terms')}>Termos de Uso</button>
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
        onOpenLegal={setLegalModal}
      />

      <UserConfigModal
        open={userConfigOpen}
        onClose={() => setUserConfigOpen(false)}
        currentUser={currentUser}
        savedTaxRates={currentPrefs?.tax_rates}
        currentPrefs={currentPrefs}
        onUserUpdate={handleUserUpdate}
        onPrefChange={handlePrefChange}
        onSearchClick={(q) => {
          setUserConfigOpen(false)
          setQuery(q)
          runCompare(q)
        }}
      />

      <TaxCalculator
        open={taxCalcOpen}
        onClose={() => setTaxCalcOpen(false)}
        savedRates={currentPrefs?.tax_rates}
      />

      {offersGroup && (
        <OffersDialog
          group={offersGroup.group}
          name={offersGroup.name}
          config={offersGroup.config}
          onClose={closeOffersDialog}
        />
      )}

      <PrivacyPage open={legalModal === 'privacy'} onClose={() => setLegalModal(null)} />
      <TermsPage   open={legalModal === 'terms'}   onClose={() => setLegalModal(null)} />

      <BetaNoticeModal
        open={betaNoticeOpen}
        onClose={() => setBetaNoticeOpen(false)}
        isLoggedIn={!!currentUser}
        betaVersion={betaVersion}
        betaTitle={betaTitle}
        betaBody1={betaBody1}
        betaBody2={betaBody2}
      />

      <DonateModal
        open={donateOpen}
        onClose={() => setDonateOpen(false)}
      />

      </>
      )}

    </>
  )
}

function AppInner() {
  const [currentUser, setCurrentUser] = useState(null)
  return (
    <CartProvider currentUser={currentUser}>
      <AppShell currentUser={currentUser} setCurrentUser={setCurrentUser} />
    </CartProvider>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  )
}
