import React, { useEffect, useState } from 'react'
import { apiFetchShowcase, apiFetchTrending, apiFetchHighlights } from '../api.js'
import { HeroBanner, Carousel, ProductCard } from './ui/index.js'
import { cheapestByCountry } from '../utils.js'

// Todas as seções de produto da Home vêm do catálogo (GET /showcase) — nada de
// raspagem ao vivo no carregamento (eram 8 buscas de 7–18s cada). Seções sem dado
// real somem em vez de mostrar "vazio": em produção recém-publicada não há buscas
// nem destaques de lojista, e a vitrine de eletrônicos segura a página sozinha.
const FALLBACK_HERO_QUERY = 'iPhone 16'

const HERO_SLIDES = [
  {
    key: 'compare',
    bg: 'linear-gradient(135deg, var(--py-color) 0%, var(--accent) 50%, var(--br-color) 100%)',
    title: 'Compare preços Paraguai × Brasil',
    subtitle: 'Descubra quanto você pode economizar comprando em Ciudad del Este.',
    cta: 'Ver ofertas',
  },
  {
    key: 'save',
    bg: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
    title: 'Economize na sua próxima viagem',
    subtitle: 'Eletrônicos, perfumes e mais — tudo comparado automaticamente.',
    cta: 'Buscar agora',
  },
]

function economyPct(group) {
  const py = cheapestByCountry(group.offers, 'py')
  const br = cheapestByCountry(group.offers, 'br')
  if (!py || !br || !(br.price.amount_brl > 0)) return null
  return Math.round(((br.price.amount_brl - py.price.amount_brl) / br.price.amount_brl) * 100)
}

export default function Home({ onSearch, recentSearches, onRecentClick, targetMargin, showMargin, onOpenOffers, onNeedAuth, onReport }) {
  const [electronics, setElectronics] = useState([]) // [{ query, group }]
  const [loadingElectronics, setLoadingElectronics] = useState(true)
  const [trending, setTrending] = useState([]) // [{ query, group }]
  const [loadingTrending, setLoadingTrending] = useState(true)
  const [highlighted, setHighlighted] = useState([]) // [group]
  const [loadingHighlights, setLoadingHighlights] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiFetchShowcase([], 8)
      .then(items => { if (!cancelled) setElectronics(items) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingElectronics(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    apiFetchTrending(8)
      .then(queries => (queries.length ? apiFetchShowcase(queries, 8) : []))
      .then(items => { if (!cancelled) setTrending(items) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingTrending(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    apiFetchHighlights(8)
      .then(groups => { if (!cancelled) setHighlighted(groups || []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingHighlights(false) })
    return () => { cancelled = true }
  }, [])

  // Real "maiores economias" — reordered from the same already-fetched real pools
  // (Mais pesquisados + Eletrônicos), not a separate fabricated ranking and not a claim
  // about the whole catalog. No extra network calls.
  const dealsPool = [...trending, ...electronics]
  const seenDealKeys = new Set()
  const deals = dealsPool
    .filter(({ group }) => {
      const key = group.product_key || group.canonical_name
      if (seenDealKeys.has(key)) return false
      seenDealKeys.add(key)
      return economyPct(group) != null
    })
    .sort((a, b) => economyPct(b.group) - economyPct(a.group))
    .slice(0, 8)

  const slides = HERO_SLIDES.map(slide => ({
    key: slide.key,
    render: () => (
      <div className="home-hero-slide" style={{ background: slide.bg }}>
        <div className="home-hero-text">
          <h2 className="home-hero-title">{slide.title}</h2>
          <p className="home-hero-subtitle">{slide.subtitle}</p>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={() => onSearch(trending[0]?.query || electronics[0]?.query || FALLBACK_HERO_QUERY)}
          >
            {slide.cta}
          </button>
        </div>
        <span className="home-hero-deco" aria-hidden="true">🇵🇾</span>
      </div>
    ),
  }))

  function renderProductCard(group, idx) {
    return (
      <ProductCard
        key={group.product_key || idx}
        group={group}
        marginPct={targetMargin}
        showMargin={showMargin}
        idx={idx}
        onOpenOffers={onOpenOffers}
        onNeedAuth={onNeedAuth}
        onReport={onReport}
      />
    )
  }

  return (
    <div className="home-page">
      <HeroBanner slides={slides} />

      {!loadingHighlights && highlighted.length > 0 && (
        <section className="home-section">
          <h2 className="home-section-title">⭐ Destaques Recomendados</h2>
          <Carousel ariaLabel="Produtos em destaque">
            {highlighted.map((group, i) => renderProductCard(group, i))}
          </Carousel>
        </section>
      )}

      {recentSearches?.length > 0 && (
        <section className="home-section">
          <h2 className="home-section-title">🕑 Baseado nas suas buscas</h2>
          <Carousel ariaLabel="Buscas recentes">
            {recentSearches.map((q, i) => (
              <button
                key={`${q}-${i}`}
                type="button"
                className="home-recent-card"
                onClick={() => onRecentClick(q)}
              >
                <span className="home-recent-icon">🔍</span>
                <span className="home-recent-query">{q}</span>
              </button>
            ))}
          </Carousel>
        </section>
      )}

      {!loadingTrending && trending.length > 0 && (
        <section className="home-section">
          <h2 className="home-section-title">🔥 Mais pesquisados</h2>
          <Carousel ariaLabel="Produtos mais pesquisados">
            {trending.map(({ group }, i) => renderProductCard(group, i))}
          </Carousel>
        </section>
      )}

      <section className="home-section">
        <h2 className="home-section-title">📱 Eletrônicos em destaque</h2>
        {loadingElectronics ? (
          <p className="home-section-loading">Carregando…</p>
        ) : electronics.length === 0 ? (
          <p className="home-section-loading">Não foi possível carregar sugestões agora.</p>
        ) : (
          <Carousel ariaLabel="Eletrônicos em destaque">
            {electronics.map(({ group }, i) => renderProductCard(group, i))}
          </Carousel>
        )}
      </section>

      {!loadingElectronics && !loadingTrending && deals.length > 0 && (
        <section className="home-section">
          <h2 className="home-section-title">💰 Maiores economias</h2>
          <Carousel ariaLabel="Produtos com maior economia">
            {deals.map(({ group }, i) => renderProductCard(group, i))}
          </Carousel>
        </section>
      )}
    </div>
  )
}
