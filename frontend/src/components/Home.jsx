import React, { useEffect, useState } from 'react'
import HeroSlide, { HERO_SLIDES } from './HeroSlide.jsx'
import { apiFetchShowcase, apiFetchTrending, apiFetchHighlights } from '../api.js'
import { HeroBanner, Carousel, ProductCard } from './ui/index.js'
import { cheapestByCountry } from '../utils.js'

// Todas as seções de produto da Home vêm do catálogo (GET /showcase) — nada de
// raspagem ao vivo no carregamento (eram 8 buscas de 7–18s cada). Seções sem dado
// real somem em vez de mostrar "vazio": em produção recém-publicada não há buscas
// nem destaques de lojista, e a vitrine de eletrônicos segura a página sozinha.
const FALLBACK_HERO_QUERY = 'iPhone 16'


function economyPct(group) {
  const py = cheapestByCountry(group.offers, 'py')
  const br = cheapestByCountry(group.offers, 'br')
  if (!py || !br || !(br.price.amount_brl > 0)) return null
  return Math.round(((br.price.amount_brl - py.price.amount_brl) / br.price.amount_brl) * 100)
}

/** Fileira de cards-esqueleto (mesmo brilho da busca) enquanto a seção carrega. */
function SectionSkeleton({ label }) {
  return (
    <div className="home-skeleton-row" role="status" aria-busy="true" aria-label={`Carregando ${label}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <div className="skeleton-card" key={i} aria-hidden="true">
          <div className="skeleton skeleton-image" />
          <div className="skeleton-card__body">
            <div className="skeleton skeleton-text skeleton-text--short" />
            <div className="skeleton skeleton-text skeleton-text--title" />
            <div className="skeleton skeleton-chip" />
            <div className="skeleton-row">
              <div className="skeleton skeleton-text skeleton-text--short" />
              <div className="skeleton skeleton-text skeleton-text--price" />
            </div>
            <div className="skeleton skeleton-button" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Home({ onSearch, recentSearches, targetMargin, showMargin, onOpenOffers, onNeedAuth, onReport }) {
  const [electronics, setElectronics] = useState([]) // [{ query, group }]
  const [loadingElectronics, setLoadingElectronics] = useState(true)
  const [trending, setTrending] = useState([]) // [{ query, group }]
  const [loadingTrending, setLoadingTrending] = useState(true)
  const [forYou, setForYou] = useState([]) // [{ query, group }] — produtos das buscas recentes
  const [loadingForYou, setLoadingForYou] = useState(true)
  const [highlighted, setHighlighted] = useState([]) // [group]
  const [loadingHighlights, setLoadingHighlights] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiFetchShowcase([], 12) // 12: sobra depois de tirar o que já apareceu acima
      .then(items => { if (!cancelled) setElectronics(items) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingElectronics(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    // fill: sem buscas reais suficientes, o backend completa com um produto de cada categoria
    apiFetchTrending(8)
      .then(queries => apiFetchShowcase(queries, 8, { fill: true }))
      .then(items => { if (!cancelled) setTrending(items) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingTrending(false) })
    return () => { cancelled = true }
  }, [])

  // Chave estável: recentSearches vira um array novo a cada render do App
  const recentKey = (recentSearches || []).slice(0, 12).join('\n')
  useEffect(() => {
    let cancelled = false
    // Pede 12 pra sobrar depois de tirar o que já está em "Mais pesquisados".
    // fill: completa com a mesma categoria das buscas; sem buscas, vira sugestões gerais.
    apiFetchShowcase(recentKey ? recentKey.split('\n') : [], 12, { fill: true })
      .then(items => { if (!cancelled) setForYou(items) })
      .catch(() => { if (!cancelled) setForYou([]) })
      .finally(() => { if (!cancelled) setLoadingForYou(false) })
    return () => { cancelled = true }
  }, [recentKey])

  useEffect(() => {
    let cancelled = false
    apiFetchHighlights(8)
      .then(groups => { if (!cancelled) setHighlighted(groups || []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingHighlights(false) })
    return () => { cancelled = true }
  }, [])

  const trendingKeys = new Set(trending.map(({ group }) => group.product_key))
  // Não espera "Mais pesquisados" (termo amplo leva segundos na 1ª carga): mostra já e
  // tira os repetidos quando ele chegar
  const forYouShown = forYou.filter(({ group }) => !trendingKeys.has(group.product_key)).slice(0, 8)

  const shownAbove = new Set([...trendingKeys, ...forYouShown.map(({ group }) => group.product_key)])
  const electronicsShown = electronics.filter(({ group }) => !shownAbove.has(group.product_key)).slice(0, 8)

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
      <HeroSlide
        slide={slide}
        onCta={() => onSearch(trending[0]?.query || electronics[0]?.query || FALLBACK_HERO_QUERY)}
      />
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

      {(loadingHighlights || highlighted.length > 0) && (
        <section className="home-section">
          <h2 className="home-section-title">⭐ Destaques Recomendados</h2>
          {loadingHighlights ? (
            <SectionSkeleton label="destaques" />
          ) : (
            <Carousel ariaLabel="Produtos em destaque">
              {highlighted.map((group, i) => renderProductCard(group, i))}
            </Carousel>
          )}
        </section>
      )}

      {(loadingForYou || forYouShown.length > 0) && (
        <section className="home-section">
          <h2 className="home-section-title">{recentKey ? '🕑 Baseado nas suas buscas' : '✨ Sugestões para você'}</h2>
          {loadingForYou ? (
            <SectionSkeleton label="sugestões" />
          ) : (
            <Carousel ariaLabel={recentKey ? 'Produtos baseados nas suas buscas' : 'Sugestões de produtos'}>
              {forYouShown.map(({ group }, i) => renderProductCard(group, i))}
            </Carousel>
          )}
        </section>
      )}

      {(loadingTrending || trending.length > 0) && (
        <section className="home-section">
          <h2 className="home-section-title">🔥 Mais pesquisados</h2>
          {loadingTrending ? (
            <SectionSkeleton label="mais pesquisados" />
          ) : (
            <Carousel ariaLabel="Produtos mais pesquisados">
              {trending.map(({ group }, i) => renderProductCard(group, i))}
            </Carousel>
          )}
        </section>
      )}

      <section className="home-section">
        <h2 className="home-section-title">📱 Eletrônicos em destaque</h2>
        {loadingElectronics ? (
          <SectionSkeleton label="eletrônicos" />
        ) : electronicsShown.length === 0 ? (
          <p className="home-section-loading">Não foi possível carregar sugestões agora.</p>
        ) : (
          <Carousel ariaLabel="Eletrônicos em destaque">
            {electronicsShown.map(({ group }, i) => renderProductCard(group, i))}
          </Carousel>
        )}
      </section>

      {(loadingElectronics || deals.length > 0) && (
        <section className="home-section">
          <h2 className="home-section-title">💰 Maiores economias</h2>
          {loadingElectronics ? (
            <SectionSkeleton label="maiores economias" />
          ) : (
            <Carousel ariaLabel="Produtos com maior economia">
              {deals.map(({ group }, i) => renderProductCard(group, i))}
            </Carousel>
          )}
        </section>
      )}
    </div>
  )
}
