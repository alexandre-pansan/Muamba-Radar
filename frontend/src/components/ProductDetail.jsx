import React, { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { apiCompare } from '../api.js'
import { useCart } from '../CartContext.jsx'
import { familyDisplayName, buildConfigChip, formatMoney, sourceDomain } from '../utils.js'
import { Breadcrumb, Carousel, ProductCard, EmptyState, Button } from './ui/index.js'

function HeartBtn({ offer, group, onNeedAuth }) {
  const { savedUrls, toggle } = useCart()
  const isSaved = savedUrls.has(offer.url)

  function handleClick(e) {
    e.stopPropagation()
    toggle(offer, () => onNeedAuth?.(), group)
  }

  return (
    <button
      className={`od-heart-btn${isSaved ? ' is-saved' : ''}`}
      type="button"
      aria-label={isSaved ? 'Remover da lista' : 'Salvar na lista'}
      onClick={handleClick}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </button>
  )
}

function OfferRows({ offers, group, countryClass, onNeedAuth }) {
  return offers.map((offer, i) => (
    <tr key={offer.offer_id || i} className={`od-row od-row--${countryClass}`}>
      <td className="od-save"><HeartBtn offer={offer} group={group} onNeedAuth={onNeedAuth} /></td>
      <td className="od-store">{offer.store}</td>
      <td className="od-title" title={offer.title || ''}>{offer.title || ''}</td>
      <td className="od-price">{formatMoney(offer.price.amount, offer.price.currency)}</td>
      <td className="od-brl">{formatMoney(offer.price.amount_brl, 'BRL')}</td>
      <td className="od-link">
        <a href={offer.url} target="_blank" rel="noopener noreferrer">{sourceDomain(offer.url)}</a>
      </td>
    </tr>
  ))
}

export default function ProductDetail({ targetMargin, showMargin, onOpenOffers, onNeedAuth, onReport }) {
  const { productKey } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [group, setGroup] = useState(location.state?.group || null)
  const [loading, setLoading] = useState(!location.state?.group)
  const [notFound, setNotFound] = useState(false)
  const [similar, setSimilar] = useState([])
  const [imgFailed, setImgFailed] = useState(false)

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
  const sorted = [...group.offers].sort((a, b) => a.price.amount_brl - b.price.amount_brl)
  const pyOffers = sorted.filter(o => (o.country || '').toLowerCase() === 'py')
  const brOffers = sorted.filter(o => (o.country || '').toLowerCase() === 'br')

  return (
    <div className="pd-page">
      <Breadcrumb items={[
        { label: 'Início', onClick: () => navigate('/') },
        { label: name },
      ]} />

      <div className="pd-hero">
        <div className={`pd-image${group.product_image_url && !imgFailed ? '' : ' no-image'}`}>
          {group.product_image_url && !imgFailed && (
            <img src={group.product_image_url} alt={name} onError={() => setImgFailed(true)} />
          )}
        </div>
        <div className="pd-info">
          <h1 className="pd-name">{name}</h1>
          {config && <span className="config-chip">{config}</span>}
          <p className="pd-offer-count">
            {group.offers.length} oferta{group.offers.length !== 1 ? 's' : ''} encontrada{group.offers.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="pd-comparison">
        <h2 className="pd-section-title">Comparar preços</h2>
        <table className="offers-inner">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Loja</th>
              <th>Título</th>
              <th>Preço</th>
              <th>BRL</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {pyOffers.length > 0 && (
              <>
                <tr className="od-section-row"><td colSpan={6} className="od-section-label od-section-py">Paraguai</td></tr>
                <OfferRows offers={pyOffers} group={group} countryClass="py" onNeedAuth={onNeedAuth} />
              </>
            )}
            {brOffers.length > 0 && (
              <>
                <tr className="od-section-row"><td colSpan={6} className="od-section-label od-section-br">Brasil</td></tr>
                <OfferRows offers={brOffers} group={group} countryClass="br" onNeedAuth={onNeedAuth} />
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Specs tab intentionally omitted — the real /compare API doesn't return offer
          specs today (only the catalog crawler populates that DB column, it's not
          exposed via OfferModel). Add this back if/when the API surfaces it. */}

      {/* Price history intentionally omitted — requires backend time-series retention,
          not built. See Phase 9 of the port plan. */}

      {similar.length > 0 && (
        <section className="pd-similar">
          <h2 className="pd-section-title">Produtos similares</h2>
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
