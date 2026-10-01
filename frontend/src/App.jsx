import React, { useState, useEffect, useCallback, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { I18nProvider, useI18n } from './i18n.jsx'
import { EmptyState, Button } from './components/ui/index.js'

/** Placeholder for routes reserved in Phase 0.3 but not yet built (see the port plan,
 * Phases 3–8). Replaced by the real page component when its phase lands. */
function ComingSoonPage({ title, onBack }) {
  return (
    <div className="app-shell" style={{ display: 'block', padding: 'var(--space-2xl)' }}>
      <EmptyState
        icon="🚧"
        title={title}
        text="Essa página ainda está sendo construída."
        action={<Button variant="secondary" onClick={onBack}>← Voltar</Button>}
      />
    </div>
  )
}

function MobileSearchBar({ query, onQueryChange, sort, onSortChange, onSearch, hidden }) {
  const { t } = useI18n()
  return (
    <div className={`mobile-search-bar${hidden ? ' mobile-search-bar--hidden' : ''}`}>
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
import ResultsArea from './components/ResultsArea.jsx'
import Home from './components/Home.jsx'
import Favorites from './components/Favorites.jsx'
import MapPage from './components/MapPage.jsx'
import ProductDetail from './components/ProductDetail.jsx'
import AuthModal from './components/AuthModal.jsx'
import UserConfigModal from './components/UserConfigModal.jsx'
import AdminPage from './components/AdminPage.jsx'
import PrivacyPage from './components/PrivacyPage.jsx'
import TermsPage from './components/TermsPage.jsx'
import TaxCalculator from './components/TaxCalculator.jsx'
import ImportDutyCalculator from './components/ImportDutyCalculator.jsx'
import OffersDialog from './components/OffersDialog.jsx'
import BetaNoticeModal, { shouldShowBetaNotice } from './components/BetaNoticeModal.jsx'
import DonateModal from './components/DonateModal.jsx'
import { HelpModal, TutorialCard } from './components/HelpCenter.jsx'
import ReportModal from './components/ReportModal.jsx'
import CartPage from './components/CartPage.jsx'
import Plans from './components/Plans.jsx'
import Checkout from './components/Checkout.jsx'
import Lojista from './components/Lojista.jsx'
import LoginPage from './components/LoginPage.jsx'
import ProfilePage from './components/ProfilePage.jsx'
import PrivacyConsent, { getCookieConsent } from './components/PrivacyConsent.jsx'
import { CartProvider, useCart } from './CartContext.jsx'
import { FavoritesProvider } from './FavoritesContext.jsx'
import { ToastProvider } from './components/ui/index.js'
import {
  getToken, getRefreshToken, setToken, apiLogout,
  apiFetchMe, apiFetchPrefs, apiFetchFeaturedImages,
  apiFetchUserSearches, apiCompare, apiSavePrefs, apiFetchConfig,
} from './api.js'

const RECENT_KEY = 'muamba_recent'
const RECENT_MAX = 8

const THEME_KEY = 'muamba_theme'

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }, [])

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
  const [importCalcOpen, setImportCalcOpen] = useState(false)
  const [importCalcInitialUSD, setImportCalcInitialUSD] = useState(null)
  const [betaNoticeOpen, setBetaNoticeOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [tutorialMode, setTutorialMode] = useState(null) // 'visitor' | 'lojista' | null
  const [donateOpen, setDonateOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState(null) // { title, offerUrl, snapshot }
  const [betaVersion, setBetaVersion] = useState(1)
  const [betaTitle, setBetaTitle] = useState('')
  const [betaBody1, setBetaBody1] = useState('')
  const [betaBody2, setBetaBody2] = useState('')
  const [donateGoal, setDonateGoal] = useState(80)
  const [donateRaised, setDonateRaised] = useState(0)
  const [donateSupporters, setDonateSupporters] = useState(0)

  // Page routing (react-router-dom — see Phase 0.3 of the port plan)
  const navigate = useNavigate()
  const goAdmin     = useCallback(() => navigate('/admin'), [navigate])
  const goCart      = useCallback(() => navigate('/cart'), [navigate])
  const goHome      = useCallback(() => navigate('/'), [navigate])
  const goFavorites = useCallback(() => navigate('/favorites'), [navigate])
  const goProfile   = useCallback(() => navigate('/profile'), [navigate])

  // Legal modals
  const [legalModal, setLegalModal] = useState(null) // 'privacy' | 'terms' | null

  // Mobile scroll — hide search bar on scroll down, show scroll-to-top btn
  const resultsScrollRef = useRef(null)
  const [searchBarHidden, setSearchBarHidden] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const el = resultsScrollRef.current
    if (!el) return
    function onScroll() {
      const y = el.scrollTop
      const delta = y - lastScrollY.current
      lastScrollY.current = y
      if (delta > 8 && y > 60) setSearchBarHidden(true)
      else if (delta < -8) setSearchBarHidden(false)
      setShowScrollTop(y > 200)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Offers dialog
  const [offersGroup, setOffersGroup] = useState(null) // {group, name, config}

  // ── Auth ────────────────────────────────────────────────────────────────────

  const loadUserData = useCallback(async () => {
    const token = getToken()
    const hasRefresh = !!getRefreshToken()
    if (!token && !hasRefresh) {
      setCurrentUser(null)
      setCurrentPrefs({ show_margin: false })
      loadLocalRecents()
      return
    }
    try {
      const user = await apiFetchMe()
      if (!user) {
        // apiFetchMe already tried refreshing first — if it still came back empty, either
        // the refresh token was genuinely rejected (api.js already cleared it) or the
        // backend is unreachable. Either way, don't clear storage here: a transient
        // failure would otherwise force a real re-login on the next reload for nothing.
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
      // apiFetchMe succeeded but a follow-up call (prefs/config) failed — likely transient.
      // Keep tokens; user stays "logged out" for this render but the next reload retries clean.
      setCurrentUser(null)
      setCurrentPrefs({ show_margin: false })
      loadLocalRecents()
    }
  }, [])

  function loadLocalRecents() {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      setRecentSearches(raw ? JSON.parse(raw) : [])
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

  function handleAuthSuccessFromPage(token) {
    setToken(token)
    loadUserData()
    navigate('/')
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
      if (getCookieConsent() !== 'all') return
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
  }

  // ── Offers dialog ───────────────────────────────────────────────────────────

  function openOffersDialog(group, name, config) {
    setOffersGroup({ group, name, config })
  }

  function openReportModal(group, offer) {
    const py = group.offers?.find(o => o.country === 'py' && (!offer || o.url === offer.url)) || group.offers?.find(o => o.country === 'py')
    const br = group.offers?.find(o => o.country === 'br')
    setReportTarget({
      title: group.canonical_name || group.family_key || '',
      offerUrl: offer?.url || null,
      snapshot: {
        py_price: py ? { amount_brl: py.price?.amount_brl, store: py.store, url: py.url } : null,
        br_price: br ? { amount_brl: br.price?.amount_brl, store: br.store, url: br.url } : null,
      },
    })
  }

  function closeOffersDialog() {
    setOffersGroup(null)
  }

  // ── Dynamic SEO ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const base = 'MuambaRadar — Comparador de preços em Ciudad del Este'
    if (lastQuery) {
      document.title = `${lastQuery} — preços no Paraguai | MuambaRadar`
      const desc = document.querySelector('meta[name="description"]')
      if (desc) desc.setAttribute('content', `Compare preços de ${lastQuery} em lojas de Ciudad del Este. Veja qual loja tem o melhor preço antes de viajar.`)
    } else {
      document.title = base
      const desc = document.querySelector('meta[name="description"]')
      if (desc) desc.setAttribute('content', 'Compare preços de eletrônicos, perfumes e produtos em lojas de Ciudad del Este antes de viajar. Economize na sua compra no Paraguai.')
    }
  }, [lastQuery])

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
        onOpenImportCalc={() => { setImportCalcInitialUSD(null); setImportCalcOpen(true) }}
        onOpenCart={goCart}
        onOpenFavorites={goFavorites}
        onOpenProfile={currentUser ? goProfile : undefined}
        onOpenHelp={() => setHelpOpen(true)}
        onCategorySearch={(q) => { navigate('/'); setQuery(q); runCompare(q) }}
        cartCount={cartItems.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        onGoHome={goHome}
        query={query}
        onQueryChange={setQuery}
        onSearch={(q) => { navigate('/'); runCompare(q) }}
        recentSearches={recentSearches}
      />

      <Routes>
      <Route path="/admin" element={<AdminPage onBack={goHome} />} />
      <Route path="/cart" element={<CartPage onBack={goHome} onOpenImportCalc={(usd) => { setImportCalcInitialUSD(usd ?? null); setImportCalcOpen(true) }} />} />
      <Route path="/favorites" element={<Favorites onNeedAuth={() => openAuthModal('login')} />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/product/:productKey" element={
        <ProductDetail
          targetMargin={targetMargin}
          showMargin={showMargin}
          onOpenOffers={openOffersDialog}
          onNeedAuth={() => openAuthModal('login')}
          onReport={openReportModal}
        />
      } />
      <Route path="/plans" element={<Plans />} />
      <Route path="/checkout" element={<Checkout currentUser={currentUser} />} />
      <Route path="/lojista" element={<Lojista currentUser={currentUser} onNeedAuth={() => openAuthModal('login')} />} />
      <Route path="/login" element={
        currentUser
          ? <Navigate to="/profile" replace />
          : <LoginPage onAuthSuccess={handleAuthSuccessFromPage} onOpenLegal={setLegalModal} />
      } />
      <Route path="/profile" element={<ProfilePage currentUser={currentUser} onLogout={handleLogout} />} />
      <Route path="/" element={
      <>
      <div className="app-shell">
        <div className="main-area">
          <MobileSearchBar
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
            onSearch={runCompare}
            hidden={searchBarHidden}
          />
          {!lastData && !isLoading ? (
            <Home
              onSearch={runCompare}
              recentSearches={recentSearches}
              onRecentClick={handleRecentClick}
              targetMargin={targetMargin}
              showMargin={showMargin}
              onOpenOffers={openOffersDialog}
              onNeedAuth={() => openAuthModal('login')}
              onReport={openReportModal}
            />
          ) : (
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
              onMarginChange={setTargetMargin}
              onRetry={handleRetry}
              onClear={handleClear}
              featuredImages={featuredImages}
              onOpenOffers={openOffersDialog}
              onNeedAuth={() => openAuthModal('login')}
              onReport={openReportModal}
              scrollRef={resultsScrollRef}
            />
          )}
          {showScrollTop && (
            <button
              className="scroll-to-top-btn"
              onClick={() => resultsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Voltar ao topo"
            >
              ↑
            </button>
          )}
          <footer className="app-footer">
            <span>© {new Date().getFullYear()} MuambaRadar — Comparador de preços informativo. Não vendemos produtos.</span>
            <span className="app-footer-sep">·</span>
            <span>Importações do Paraguai sujeitas à Receita Federal (isenção até USD 500/viagem).</span>
            <span className="app-footer-sep">·</span>
            <button className="app-footer-link" onClick={() => setLegalModal('privacy')}>Privacidade</button>
            <span className="app-footer-sep">·</span>
            <button className="app-footer-link" onClick={() => setLegalModal('terms')}>Termos de Uso</button>
            <span className="app-footer-sep">·</span>
            <a className="app-footer-link" href="mailto:muambaradar@gmail.com">Contato</a>
            <span className="app-footer-sep">·</span>
            <button className="app-footer-link app-footer-donate" onClick={() => setDonateOpen(true)}>
              ☕ Apoie o projeto ({donateSupporters} apoiadores)
            </button>
          </footer>
        </div>
      </div>

      </>
      } />
      </Routes>

      {/* Global modals — deliberately OUTSIDE <Routes>, so they work from any route
          (e.g. Favorites/ProductDetail triggering the login prompt or report modal),
          not just the "/" route they used to be nested inside. */}
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
          onNeedAuth={() => { closeOffersDialog(); openAuthModal('login') }}
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
        onDonate={() => { setBetaNoticeOpen(false); setDonateOpen(true) }}
      />

      <DonateModal
        open={donateOpen}
        onClose={() => setDonateOpen(false)}
      />

      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onStartSlides={() => setBetaNoticeOpen(true)}
        onStartTutorial={setTutorialMode}
      />

      <TutorialCard mode={tutorialMode} onClose={() => setTutorialMode(null)} />

      <ReportModal
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        productTitle={reportTarget?.title || ''}
        offerUrl={reportTarget?.offerUrl || null}
        snapshot={reportTarget?.snapshot || null}
        currentUser={currentUser}
      />

      <ImportDutyCalculator
        open={importCalcOpen}
        onClose={() => setImportCalcOpen(false)}
        initialUSD={importCalcInitialUSD}
      />

      <PrivacyConsent onPrivacy={() => setLegalModal('privacy')} />

    </>
  )
}

function AppInner() {
  const [currentUser, setCurrentUser] = useState(null)
  return (
    <CartProvider currentUser={currentUser}>
      <FavoritesProvider currentUser={currentUser}>
        <ToastProvider>
          <AppShell currentUser={currentUser} setCurrentUser={setCurrentUser} />
        </ToastProvider>
      </FavoritesProvider>
    </CartProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AppInner />
      </I18nProvider>
    </BrowserRouter>
  )
}
