import React, { useEffect, useState } from 'react'
import { apiCompare, apiFetchTrending, apiFetchHighlights } from '../api.js'
import { HeroBanner, Carousel, ProductCard } from './ui/index.js'
import { cheapestByCountry } from '../utils.js'

// No backend concept of "trending"/"featured" products exists — this is editorial
// curation of real, live apiCompare() data, not fabricated numbers. Labeled honestly
// as "Populares" below rather than implying real trend detection. Kept as a reliable
// fallback alongside the real "Mais pesquisados"/"Destaques Recomendados" sections below
// (backend Phase 2+), since those can legitimately be empty on a low-traffic day —
// SearchCache-driven trending reflects only the last ~30min TTL window, and highlights
// only exist once a real seller has one active.
const HOME_SEED_QUERIES = ['iPhone 17', 'RTX 5080', 'PlayStation 5', 'Nintendo Switch 2']

const HERO_SLIDES = [
  {
    key: 'compare',
    bg: 'linear-gradient(135deg, var(--py-color) 0%, var(--accent) 50%, var(--br-color) 100%)',
    title: 'Compare preços Paraguai × Brasil',
    subtitle: 'Descubra quanto você pode economizar comprando em Ciudad del Este.',
    cta: 'Ver populares',
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
  const [popular, setPopular] = useState([]) // [{ query, group }]
  const [loadingPopular, setLoadingPopular] = useState(true)
  const [trending, setTrending] = useState([]) // [{ query, group }]
  const [loadingTrending, setLoadingTrending] = useState(true)
  const [highlighted, setHighlighted] = useState([]) // [group]
  const [loadingHighlights, setLoadingHighlights] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingPopular(true)
    Promise.all(
      HOME_SEED_QUERIES.map(async q => {
        try {
          const { data } = await apiCompare(q, 'best_match')
          const group = data?.groups?.[0]
          return group ? { query: q, group } : null
        } catch {
          return null
        }
      })
    ).then(results => {
      if (!cancelled) {
        setPopular(results.filter(Boolean))
        setLoadingPopular(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingTrending(true)
    // Capped at 4 (not the endpoint's max of 8) — each trending query triggers a real
    // live scrape via /compare, same cost as a Populares seed query. Keeping Home's total
    // live-search volume on page load in the same ballpark as before this section existed.
    apiFetchTrending(4).then(async queries => {
      if (!queries.length) {
        if (!cancelled) { setTrending([]); setLoadingTrending(false) }
        return
      }
      const results = await Promise.all(
        queries.map(async q => {
          try {
            const { data } = await apiCompare(q, 'best_match')
            const group = data?.groups?.[0]
            return group ? { query: q, group } : null
          } catch {
            return null
          }
        })
      )
      if (!cancelled) {
        setTrending(results.filter(Boolean))
        setLoadingTrending(false)
      }
    }).catch(() => {
      if (!cancelled) { setTrending([]); setLoadingTrending(false) }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingHighlights(true)
    apiFetchHighlights(8).then(groups => {
      if (!cancelled) {
        setHighlighted(groups || [])
        setLoadingHighlights(false)
      }
    }).catch(() => {
      if (!cancelled) { setHighlighted([]); setLoadingHighlights(false) }
    })
    return () => { cancelled = true }
  }, [])

  // Real "maiores economias" — reordered from the same already-fetched real pools
  // (Populares + Mais pesquisados), not a separate fabricated ranking and not a claim
  // about the whole catalog. No extra network calls.
  const dealsPool = [...popular, ...trending]
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
            onClick={() => onSearch(popular[0]?.query || HOME_SEED_QUERIES[0])}
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

      <section className="home-section">
        <h2 className="home-section-title">⭐ Destaques Recomendados</h2>
        {loadingHighlights ? (
          <p className="home-section-loading">Carregando…</p>
        ) : highlighted.length === 0 ? (
          <p className="home-section-loading">Nenhum produto em destaque no momento.</p>
        ) : (
          <Carousel ariaLabel="Produtos em destaque">
            {highlighted.map((group, i) => renderProductCard(group, i))}
          </Carousel>
        )}
      </section>

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

      <section className="home-section">
        <h2 className="home-section-title">🔥 Mais pesquisados</h2>
        {loadingTrending ? (
          <p className="home-section-loading">Carregando…</p>
        ) : trending.length === 0 ? (
          <p className="home-section-loading">Sem buscas recentes suficientes ainda.</p>
        ) : (
          <Carousel ariaLabel="Produtos mais pesquisados">
            {trending.map(({ group }, i) => renderProductCard(group, i))}
          </Carousel>
        )}
      </section>

      <section className="home-section">
        <h2 className="home-section-title">⭐ Populares</h2>
        {loadingPopular ? (
          <p className="home-section-loading">Carregando…</p>
        ) : popular.length === 0 ? (
          <p className="home-section-loading">Não foi possível carregar sugestões agora.</p>
        ) : (
          <Carousel ariaLabel="Produtos populares">
            {popular.map(({ group }, i) => renderProductCard(group, i))}
          </Carousel>
        )}
      </section>

      {!loadingPopular && !loadingTrending && deals.length > 0 && (
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
