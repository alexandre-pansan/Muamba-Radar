import React, { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { apiCompare } from '../api.js'
import { useCart } from '../CartContext.jsx'
import { useFavorites } from '../FavoritesContext.jsx'
import { useFeatures } from '../features.js'
import { familyDisplayName, buildConfigChip, formatMoney, sourceDomain, cheapestByCountry } from '../utils.js'
import { Carousel, ProductCard, EmptyState, Button } from './ui/index.js'

// Foto "sem imagem" dos sites não conta como foto.
const isRealImage = url => Boolean(url) && !/sem-imagem|sem_imagem|no-?image|placeholder/i.test(url)

// Cores que o adapter anota no fim do título ("... [preto]"); as lojas escrevem em
// português, inglês ou espanhol, então normaliza para português antes de juntar.
const COLOR_PT = {
  black: 'preto', negro: 'preto', white: 'branco', blanco: 'branco', green: 'verde',
  blue: 'azul', pink: 'rosa', red: 'vermelho', rojo: 'vermelho', gray: 'cinza', grey: 'cinza',
  gris: 'cinza', silver: 'prata', plata: 'prata', gold: 'dourado', dorado: 'dourado',
  purple: 'roxo', morado: 'roxo', yellow: 'amarelo', amarillo: 'amarelo', orange: 'laranja',
  naranja: 'laranja', titanium: 'titânio', natural: 'natural', midnight: 'meia-noite',
  teal: 'verde-azulado', ultramarine: 'ultramarino',
}
function offerColor(title) {
  const m = /\[([^\]]+)\]\s*$/.exec(title || '')
  if (!m) return null
  const raw = m[1].trim().toLowerCase()
  return COLOR_PT[raw] || raw
}

const country = o => (o.country || '').toLowerCase()

/** Uma linha por loja do Paraguai: a oferta mais barata dela + quantas ofertas tem. */
function storeRowsFrom(offers) {
  const byStore = new Map()
  for (const o of offers.filter(o => country(o) === 'py')) {
    const cur = byStore.get(o.store)
    if (!cur) byStore.set(o.store, { store: o.store, best: o, count: 1, info: o.store_info })
    else {
      cur.count += 1
      if (o.price.amount_brl < cur.best.price.amount_brl) cur.best = o
      cur.info = cur.info || o.store_info
    }
  }
  return [...byStore.values()].sort((a, b) => a.best.price.amount_brl - b.best.price.amount_brl)
}

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  )
}

/** Ações do carrinho para uma oferta: "+ Carrinho" ou "Remover / Adicionar mais". */
function CartActions({ offer, group, onNeedAuth, size = 'sm' }) {
  const { items, toggle, remove, setQuantity } = useCart()
  const item = items.find(i => i.offer_url === offer.url)
  if (!item) {
    return (
      <button type="button" className={`pd-cart-btn pd-cart-btn--${size}`} onClick={e => { e.stopPropagation(); toggle(offer, onNeedAuth, group) }}>
        {size === 'lg' ? '🛒 Adicionar ao Carrinho' : '+ Carrinho'}
      </button>
    )
  }
  const qty = item.quantity || 1
  return (
    <div className={`pd-cart-in pd-cart-in--${size}`} onClick={e => e.stopPropagation()}>
      <div className="pd-cart-in__buttons">
        <button type="button" className="pd-cart-remove" onClick={() => remove(item.id)}>Remover</button>
        <button type="button" className="pd-cart-more" onClick={() => setQuantity(item.id, qty + 1)} disabled={qty >= 99}>
          {size === 'lg' ? 'Adicionar mais' : 'Adicionar'}
        </button>
      </div>
      <span className="pd-cart-in__qty">{qty} no carrinho</span>
    </div>
  )
}

function FavButton({ offer }) {
  const { isFavorited, toggle } = useFavorites()
  const fav = isFavorited(offer.url)
  return (
    <button
      type="button"
      className={`pd-fav-btn${fav ? ' is-active' : ''}`}
      onClick={e => { e.stopPropagation(); toggle(offer) }}
      aria-label={fav ? 'Remover dos favoritos' : 'Favoritar'}
      title={fav ? 'Remover dos favoritos' : 'Favoritar'}
    >
      <HeartIcon filled={fav} />
    </button>
  )
}

export default function ProductDetail({ targetMargin, showMargin, onOpenOffers, onNeedAuth, onReport }) {
  const { productKey } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [group, setGroup] = useState(location.state?.group || null)
  const [loading, setLoading] = useState(!location.state?.group)
  const [notFound, setNotFound] = useState(false)
  const [similar, setSimilar] = useState([])
  const [failedImages, setFailedImages] = useState(() => new Set())
  const [activeImage, setActiveImage] = useState(null)
  const [tab, setTab] = useState('specs')
  const { coupons: couponsEnabled } = useFeatures()

  // Link aberto do zero (F5 em outra aba, link compartilhado): refaz a busca de origem
  // (?q= na URL) e procura ESTA chave. Sem ?q (links antigos) tenta o slug. Nunca cai
  // em "primeiro resultado qualquer" — produto errado é pior que "não encontrado".
  useEffect(() => {
    if (location.state?.group) return
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    const guess = searchParams.get('q') || productKey.replace(/[-_]/g, ' ')
    apiCompare(guess, 'best_match')
      .then(({ data }) => {
        if (cancelled) return
        const found = data.groups?.find(g => g.product_key === productKey) || null
        if (found) setGroup(found)
        else setNotFound(true)
      })
      .catch(() => { if (!cancelled) setNotFound(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Similar products" — real search on the family name, current group filtered out.
  // No fabricated data: this is honest live search, just like Home's "Populares".
  useEffect(() => {
    if (!group) return
    let cancelled = false
    apiCompare(familyDisplayName(group), 'best_match')
      .then(({ data }) => {
        if (cancelled) return
        setSimilar((data.groups || []).filter(g => g.product_key !== group.product_key).slice(0, 4))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [group?.product_key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <p className="pd-loading">Carregando…</p>
  }

  if (notFound || !group) {
    return (
      <div className="pd-page">
        <EmptyState
          icon="🔎"
          title="Produto não encontrado"
          text="Esse link pode estar desatualizado. Faça uma nova busca."
          action={<Button variant="primary" onClick={() => navigate('/')}>← Voltar pra busca</Button>}
        />
      </div>
    )
  }

  const name = familyDisplayName(group)
  const config = buildConfigChip(group)
  const offers = group.offers || []
  const storeRows = storeRowsFrom(offers)
  const pyBest = cheapestByCountry(offers, 'py')
  const brBest = cheapestByCountry(offers, 'br')
  const brOffers = offers.filter(o => country(o) === 'br').sort((a, b) => a.price.amount_brl - b.price.amount_brl)
  const economy = pyBest && brBest && brBest.price.amount_brl > 0
    ? Math.round(((brBest.price.amount_brl - pyBest.price.amount_brl) / brBest.price.amount_brl) * 100)
    : null

  // Loja "Visualizando": vem da URL (&loja=...) — recarregar mantém; padrão = a mais barata.
  const activeRow = storeRows.find(r => r.store === searchParams.get('loja')) || storeRows[0] || null
  const activeOffer = activeRow?.best || pyBest || brBest
  function selectStore(store) {
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('loja', store); return n }, { replace: true })
  }

  // Galeria: fotos reais e distintas das ofertas (a do grupo primeiro).
  const images = [...new Set([group.product_image_url, ...offers.map(o => o.image_url)].filter(isRealImage))]
    .filter(u => !failedImages.has(u))
    .slice(0, 4)
  const mainImage = images.includes(activeImage) ? activeImage : images[0]
  const markFailed = url => setFailedImages(prev => new Set(prev).add(url))

  const colors = [...new Set(offers.filter(o => country(o) === 'py').map(o => offerColor(o.title)).filter(Boolean))]
  const specs = [
    ['Modelo', name],
    config && ['Configuração', config],
    group.voltage && ['Voltagem', group.voltage],
    group.concentration && ['Concentração', group.concentration],
    group.volume_ml && ['Volume', group.volume_ml],
    colors.length > 0 && ['Cores nas lojas', colors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')],
    ['Ofertas encontradas', `${storeRows.length} loja${storeRows.length !== 1 ? 's' : ''} no Paraguai · ${brOffers.length} no Brasil`],
    ['Importação', 'Cota de US$ 500 por pessoa (terrestre) ou US$ 1.000 (aéreo); 50% de imposto sobre o excedente.'],
  ].filter(Boolean)

  const searchQuery = searchParams.get('q')
  const info = activeRow?.info

  return (
    <div className="pd-page">
      <div className="pd-topbar">
        <button type="button" className="pd-back" onClick={() => (searchQuery ? navigate(`/?q=${encodeURIComponent(searchQuery)}`) : navigate('/'))}>
          ← {searchQuery ? 'Voltar para a busca' : 'Voltar para Home'}
        </button>
        <span className="pd-crumbs">Home › {searchQuery ? `"${searchQuery}" › ` : ''}{name}</span>
      </div>

      <div className="pd-hero">
        <div className="pd-gallery">
          <div className={`pd-image${mainImage ? '' : ' no-image'}`}>
            {mainImage && <img src={mainImage} alt={name} onError={() => markFailed(mainImage)} />}
          </div>
          {images.length > 1 && (
            <div className="pd-thumbs">
              {images.map(url => (
                <button
                  type="button"
                  key={url}
                  className={`pd-thumb${url === mainImage ? ' is-active' : ''}`}
                  onClick={() => setActiveImage(url)}
                  aria-label="Ver foto"
                >
                  <img src={url} alt="" loading="lazy" onError={() => markFailed(url)} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pd-info">
          <h1 className="pd-name">{name}</h1>
          <div className="pd-badges">
            {config && <span className="pd-badge">{config}</span>}
            {colors.length > 0 && <span className="pd-badge">{colors.length} cor{colors.length !== 1 ? 'es' : ''}</span>}
            {economy != null && economy > 0 && <span className="pd-badge pd-badge--economy">-{economy}% de Economia</span>}
          </div>

          {activeOffer && (
            <div className="pd-info-card">
              <h3>Informações</h3>
              <ul>
                <li><strong>Loja:</strong> {activeOffer.store}</li>
                <li><strong>Preço:</strong> {formatMoney(activeOffer.price.amount, activeOffer.price.currency)}</li>
                <li><strong>Em reais:</strong> {formatMoney(activeOffer.price.amount_brl, 'BRL')}</li>
                <li><strong>Site:</strong> <a href={activeOffer.url} target="_blank" rel="noopener noreferrer">Ver oferta na loja ↗</a></li>
                {couponsEnabled && group.coupon && (
                  <li className="pd-info-wide"><strong>Cupom da loja:</strong> <span className="pd-coupon">🎟️ {group.coupon.code}</span></li>
                )}
                {(info?.address || info?.google_maps_url) && (
                  <li className="pd-info-wide pd-info-contact">
                    <strong>Onde fica:</strong>
                    {info.address && <span>📍 {info.address}</span>}
                    {info.google_maps_url && <a href={info.google_maps_url} target="_blank" rel="noopener noreferrer">Abrir no Google Maps ↗</a>}
                  </li>
                )}
              </ul>
            </div>
          )}

          {activeOffer && <CartActions offer={activeOffer} group={group} onNeedAuth={onNeedAuth} size="lg" />}
        </div>
      </div>

      <div className={`pd-br-ref${brBest ? '' : ' is-empty'}`}>
        <div>
          <span className="pd-br-ref__label">Referência no Brasil</span>
          {brBest ? (
            <>
              <h4>Menor preço em território nacional: {formatMoney(brBest.price.amount_brl, 'BRL')}</h4>
              <p>Verificado em <a href={brBest.url} target="_blank" rel="noopener noreferrer">{sourceDomain(brBest.url)}</a>{brOffers.length > 1 ? ` · ${brOffers.length} ofertas no Brasil` : ''}</p>
            </>
          ) : (
            <h4>Sem preço no Brasil para comparar este produto ainda.</h4>
          )}
        </div>
        {economy != null && (
          <div className="pd-br-ref__economy">
            <span>Diferença de economia</span>
            <strong className={economy < 0 ? 'is-negative' : ''}>{economy > 0 ? `-${economy}%` : `+${Math.abs(economy)}%`}</strong>
          </div>
        )}
      </div>

      {storeRows.length > 0 && (
        <section className="pd-section">
          <h2 className="pd-section-title">Comparativo de lojas no Paraguai</h2>
          <div className="pd-table-wrap">
            <table className="pd-store-table">
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Preço (USD / BRL)</th>
                  <th className="pd-col-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {storeRows.map((row, i) => {
                  const isActive = row.store === activeRow?.store
                  return (
                    <tr key={row.store} className={isActive ? 'is-active' : ''} onClick={() => selectStore(row.store)}>
                      <td>
                        <a href={row.best.url} target="_blank" rel="noopener noreferrer" className="pd-store-link" onClick={e => e.stopPropagation()}>
                          {row.store} ↗
                        </a>
                        {i === 0 && <span className="pd-tag pd-tag--best">✓ Melhor preço</span>}
                        {isActive && <span className="pd-tag pd-tag--active">Visualizando</span>}
                        {row.count > 1 && <span className="pd-store-count">{row.count} ofertas nesta loja</span>}
                      </td>
                      <td className="pd-col-price">
                        <strong>{formatMoney(row.best.price.amount, row.best.price.currency)}</strong>{' '}
                        <span>({formatMoney(row.best.price.amount_brl, 'BRL')})</span>
                      </td>
                      <td className="pd-col-actions">
                        <div className="pd-row-actions">
                          <CartActions offer={row.best} group={group} onNeedAuth={onNeedAuth} />
                          <FavButton offer={row.best} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="pd-footnote">Clique numa loja para ver as informações dela acima. Preços em reais pela cotação do dia — confirme o valor final na loja.</p>
        </section>
      )}

      <section className="pd-section">
        <div className="pd-tabs" role="tablist">
          <button type="button" role="tab" className={`pd-tab${tab === 'specs' ? ' is-active' : ''}`} onClick={() => setTab('specs')}>Especificações</button>
          <button type="button" role="tab" className={`pd-tab${tab === 'offers' ? ' is-active' : ''}`} onClick={() => setTab('offers')}>Todas as ofertas ({offers.length})</button>
        </div>
        {tab === 'specs' ? (
          <table className="pd-specs">
            <tbody>
              {specs.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
            </tbody>
          </table>
        ) : (
          <div className="pd-table-wrap">
            <table className="pd-all-offers">
              <thead><tr><th>País</th><th>Loja</th><th>Anúncio</th><th>Preço</th><th>Em reais</th></tr></thead>
              <tbody>
                {[...offers].sort((a, b) => country(a).localeCompare(country(b)) * -1 || a.price.amount_brl - b.price.amount_brl).map((o, i) => (
                  <tr key={o.offer_id || i}>
                    <td>{country(o) === 'br' ? '🇧🇷' : '🇵🇾'}</td>
                    <td>{o.store}</td>
                    <td className="pd-offer-title"><a href={o.url} target="_blank" rel="noopener noreferrer" title={o.title}>{o.title}</a></td>
                    <td className="pd-nowrap">{formatMoney(o.price.amount, o.price.currency)}</td>
                    <td className="pd-nowrap"><strong>{formatMoney(o.price.amount_brl, 'BRL')}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {similar.length > 0 && (
        <section className="pd-section">
          <h2 className="pd-section-title">Produtos similares recomendados</h2>
          <Carousel ariaLabel="Produtos similares">
            {similar.map((g, i) => (
              <ProductCard
                key={g.product_key || i}
                group={g}
                marginPct={targetMargin}
                showMargin={showMargin}
                idx={i}
                onOpenOffers={onOpenOffers}
                onNeedAuth={onNeedAuth}
                onReport={onReport}
              />
            ))}
          </Carousel>
        </section>
      )}
    </div>
  )
}
