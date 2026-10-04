import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCart } from '../CartContext.jsx'
import { apiCopyListToCart, apiFetchList } from '../api.js'
import { formatMoney } from '../utils.js'
import ProductImage from './ui/ProductImage.jsx'

/** Lista de compras compartilhada (/lista/:id) — só leitura; dá pra copiar pro carrinho. */
export default function SharedListPage({ currentUser, onNeedAuth }) {
  const { id } = useParams()
  const { reload: reloadCart } = useCart()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    if (!currentUser) return
    setError('')
    apiFetchList(id).then(setList).catch(err => setError(err.message))
  }, [id, currentUser])

  async function handleCopy() {
    try {
      const { added } = await apiCopyListToCart(id)
      setCopied(added)
      reloadCart()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!currentUser) {
    return (
      <div className="cart-page">
        <div className="cart-empty-state">
          <div className="cart-empty-state__icon">🔐</div>
          <h3 className="cart-empty-state__title">Entre para ver esta lista</h3>
          <p className="cart-empty-state__text">Listas compartilhadas só aparecem para quem foi convidado pelo e-mail.</p>
          <button type="button" className="cart-primary-btn" onClick={onNeedAuth}>Entrar / Criar conta</button>
        </div>
      </div>
    )
  }

  if (error && !list) {
    return (
      <div className="cart-page">
        <div className="cart-empty-state">
          <div className="cart-empty-state__icon">📋</div>
          <h3 className="cart-empty-state__title">{error}</h3>
          <Link className="cart-primary-btn" to="/conta#listas">Minhas listas</Link>
        </div>
      </div>
    )
  }

  if (!list) return <div className="cart-page"><div className="cart-loading">Carregando...</div></div>

  return (
    <div className="cart-page">
      <h1 className="page-title">📋 {list.name}</h1>
      <p className="shared-list__meta">
        {list.is_owner ? 'Sua lista' : `Compartilhada por ${list.owner_name}`} · {list.items.length}{' '}
        {list.items.length === 1 ? 'item' : 'itens'} · atualizada em{' '}
        {new Date(list.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </p>

      {!list.is_owner && list.items.length > 0 && (
        <div className="shared-list__actions">
          <button type="button" className="cart-primary-btn" onClick={handleCopy}>
            Copiar itens para o meu carrinho
          </button>
          {copied != null && (
            <span className="shared-list__copied">
              {copied === 0 ? 'Todos os itens já estavam no seu carrinho.' : `${copied} ${copied === 1 ? 'item copiado' : 'itens copiados'}.`}{' '}
              <Link to="/cart">Ver carrinho</Link>
            </span>
          )}
        </div>
      )}
      {error && <p className="ucm-error">{error}</p>}

      {list.items.length === 0 ? (
        <p className="ucm-empty">Esta lista está vazia.</p>
      ) : (
        <div className="cart-items">
          {list.items.map(item => (
            <div key={item.id} className="cart-item shared-list__item">
              <div className="cart-item__image">
                <ProductImage src={item.image_url} title={item.title} />
              </div>
              <div className="cart-item__info">
                <a className="cart-item__name" href={item.offer_url} target="_blank" rel="noopener noreferrer" title={item.title}>
                  {item.title}
                </a>
                <p className="cart-item__store">{item.country === 'br' ? '🇧🇷' : '🇵🇾'} {item.store_name}</p>
              </div>
              <div className="cart-item__prices">
                <div className="cart-item__price-py">{formatMoney(item.price_amount, item.price_currency)}</div>
                {item.br_price_brl ? (
                  <div className="cart-item__price-br">🇧🇷 {formatMoney(item.br_price_brl, 'BRL')}</div>
                ) : null}
              </div>
              <div className="shared-list__qty">× {item.quantity || 1}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
