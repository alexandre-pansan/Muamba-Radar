import React from 'react'
import { useFavorites } from '../FavoritesContext.jsx'
import { useCart } from '../CartContext.jsx'
import { formatMoney } from '../utils.js'
import { EmptyState, Button } from './ui/index.js'

export default function Favorites({ onNeedAuth }) {
  const { items, remove, synced } = useFavorites()
  const { savedUrls, toggle } = useCart()

  function toOffer(fav) {
    return {
      url: fav.offer_url,
      source: fav.source,
      country: fav.country,
      store: fav.store_name,
      title: fav.title,
      image_url: fav.image_url,
      price: { amount: fav.price_amount, currency: fav.price_currency, amount_brl: fav.price_amount_brl },
    }
  }

  if (items.length === 0) {
    return (
      <div className="favorites-page">
        <EmptyState
          icon="❤️"
          title="Nenhum favorito ainda"
          text={synced
            ? 'Clique no ❤ de um produto para salvá-lo aqui — sincroniza com sua conta em qualquer dispositivo.'
            : 'Clique no ❤ de um produto para salvá-lo aqui — funciona sem login, mas fica só neste dispositivo (entre numa conta para sincronizar).'}
          action={<Button variant="primary" onClick={() => window.history.back()}>← Voltar</Button>}
        />
      </div>
    )
  }

  return (
    <div className="favorites-page">
      <div className="favorites-header">
        <h1 className="favorites-title">❤️ Meus Favoritos</h1>
        <span className="favorites-count">{items.length} produto{items.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="favorites-hint">
        {synced
          ? 'Sincronizados com sua conta — disponíveis em qualquer dispositivo.'
          : 'Salvos neste dispositivo — entre numa conta para sincronizar entre aparelhos.'}
      </p>

      <div className="favorites-grid">
        {items.map(fav => {
          const inCart = savedUrls.has(fav.offer_url)
          return (
            <div className="favorite-card" key={fav.offer_url}>
              <div className="favorite-card-image">
                {fav.image_url ? <img src={fav.image_url} alt={fav.title} loading="lazy" /> : <div className="favorite-card-noimage" />}
              </div>
              <div className="favorite-card-info">
                <p className="favorite-card-title" title={fav.title}>{fav.title}</p>
                <p className="favorite-card-store">{fav.store_name}</p>
                <p className="favorite-card-price">
                  {formatMoney(fav.price_amount, fav.price_currency)}
                  {fav.price_amount_brl != null && fav.price_currency !== 'BRL' && (
                    <span className="favorite-card-equiv"> · Equiv. {formatMoney(fav.price_amount_brl, 'BRL')}</span>
                  )}
                </p>
              </div>
              <div className="favorite-card-actions">
                <button
                  type="button"
                  className={`pc-cart-btn${inCart ? ' is-saved' : ''}`}
                  onClick={() => toggle(toOffer(fav), onNeedAuth)}
                >
                  {inCart ? '✓ No carrinho' : '+ Carrinho'}
                </button>
                <button
                  type="button"
                  className="favorite-card-remove"
                  aria-label="Remover dos favoritos"
                  title="Remover dos favoritos"
                  onClick={() => remove(fav.offer_url)}
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
