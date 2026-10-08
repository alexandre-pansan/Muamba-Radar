import React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ProductCard from './ProductCard.jsx'
import { EmptyState, Button, Select } from './ui/index.js'
import { buildConfigChip, cheapestByCountry, familyDisplayName, formatMoney } from '../utils.js'
import { isRealImage, offerCountry, productUrls, storeRowsFrom, useProductGroup } from '../productGroup.js'

const SORTS = [
  { value: 'menor', label: 'Menor preço' },
  { value: 'maior', label: 'Maior preço' },
  { value: 'loja', label: 'Loja (A–Z)' },
  { value: 'ofertas', label: 'Mais ofertas na loja' },
]

/**
 * /product/:productKey/lojas — passo do meio do fluxo do protótipo: o card
 * consolidado (produto em N lojas) abre aqui, um card por loja do Paraguai; o card
 * da loja abre o detalhe com ela já selecionada.
 */
export default function StoreOffers({ targetMargin, showMargin, onNeedAuth, onReport }) {
  const { productKey } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { group, loading, notFound } = useProductGroup(productKey)

  if (loading) return <p className="pd-loading">Carregando…</p>
  if (notFound || !group) {
    return (
      <div className="so-page">
        <EmptyState
          icon="🔎"
          title="Produto não encontrado"
          text="Esse link pode estar desatualizado. Faça uma nova busca."
          action={<Button variant="primary" onClick={() => navigate('/')}>← Voltar pra busca</Button>}
        />
      </div>
    )
  }

  const query = params.get('q')
  const order = params.get('ordem') || 'menor'
  const name = familyDisplayName(group)
  const config = buildConfigChip(group)
  const offers = group.offers || []
  const brOffers = offers.filter(o => offerCountry(o) === 'br')
  const brBest = cheapestByCountry(offers, 'br')

  const rows = storeRowsFrom(offers)
  const sorted = [...rows].sort({
    menor: (a, b) => a.best.price.amount_brl - b.best.price.amount_brl,
    maior: (a, b) => b.best.price.amount_brl - a.best.price.amount_brl,
    loja: (a, b) => a.store.localeCompare(b.store),
    ofertas: (a, b) => b.count - a.count || a.best.price.amount_brl - b.best.price.amount_brl,
  }[order] || (() => 0))

  const pyPricesBRL = rows.map(r => r.best.price.amount_brl)
  const avgPyBRL = pyPricesBRL.length ? pyPricesBRL.reduce((a, b) => a + b, 0) / pyPricesBRL.length : null
  const minPy = rows[0]?.best
  const economy = minPy && brBest && brBest.price.amount_brl > 0
    ? Math.round(((brBest.price.amount_brl - minPy.price.amount_brl) / brBest.price.amount_brl) * 100)
    : null
  const heroImage = isRealImage(group.product_image_url) ? group.product_image_url : null

  // Cada loja vira um "grupo" com só as ofertas PY dela + as do Brasil: o ProductCard
  // mostra o preço daquela loja, a referência BR e a economia de verdade.
  const storeGroups = sorted.map(row => {
    const image = row.offers.map(o => o.image_url).find(isRealImage) || group.product_image_url
    return {
      key: row.store,
      group: { ...group, offers: [...row.offers, ...brOffers], product_image_url: image, __fullGroup: group },
    }
  })

  function setOrder(value) {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      value === 'menor' ? next.delete('ordem') : next.set('ordem', value)
      return next
    }, { replace: true })
  }

  return (
    <div className="so-page">
      <div className="pd-topbar">
        <button type="button" className="pd-back" onClick={() => navigate(query ? `/?q=${encodeURIComponent(query)}` : '/')}>
          ← {query ? 'Voltar para a busca' : 'Voltar para Home'}
        </button>
        <span className="pd-crumbs">Home › {query ? `"${query}" › ` : ''}{name}</span>
      </div>

      <header className="so-summary">
        <div className={`so-summary__image${heroImage ? '' : ' no-image'}`}>
          {heroImage && <img src={heroImage} alt="" />}
        </div>
        <div className="so-summary__info">
          <h1 className="so-summary__name">{name}</h1>
          <div className="pd-badges">
            {config && <span className="pd-badge">{config}</span>}
            <span className="pd-badge">⭐ {rows.length} loja{rows.length !== 1 ? 's' : ''} no Paraguai</span>
            {economy != null && economy > 0 && <span className="pd-badge pd-badge--economy">-{economy}% de Economia</span>}
          </div>
        </div>
        <dl className="so-summary__stats">
          <div><dt>Menor PY</dt><dd>{minPy ? formatMoney(minPy.price.amount, minPy.price.currency) : '—'}</dd></div>
          <div><dt>Média PY</dt><dd>{avgPyBRL != null ? formatMoney(avgPyBRL, 'BRL') : '—'}</dd></div>
          <div><dt>Menor BR</dt><dd className="is-br">{brBest ? formatMoney(brBest.price.amount_brl, 'BRL') : '—'}</dd></div>
        </dl>
      </header>

      <div className="so-toolbar">
        <span className="so-toolbar__count">
          {rows.length} loja{rows.length !== 1 ? 's' : ''} vende{rows.length !== 1 ? 'm' : ''} este produto — clique numa loja para ver os detalhes
        </span>
        <Select className="ui-select--align-right" value={order} options={SORTS} onChange={setOrder} ariaLabel="Ordenar lojas" />
      </div>

      {storeGroups.length === 0 ? (
        <p className="so-empty">Nenhuma loja do Paraguai vende este produto no momento.</p>
      ) : (
        <div className="product-grid">
          {storeGroups.map(({ key, group: g }, i) => (
            <ProductCard
              key={key}
              group={g}
              storeView={key}
              marginPct={targetMargin}
              showMargin={showMargin}
              idx={i}
              onNeedAuth={onNeedAuth}
              onReport={onReport}
            />
          ))}
        </div>
      )}

      <p className="pd-footnote">
        Ver todas as {offers.length} ofertas, inclusive as do Brasil, na{' '}
        <a href={productUrls(group, query).detail(null)} onClick={e => { e.preventDefault(); navigate(productUrls(group, query).detail(null), { state: { group } }) }}>página do produto</a>.
      </p>
    </div>
  )
}
