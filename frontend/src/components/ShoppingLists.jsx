import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../CartContext.jsx'
import {
  apiActivateList,
  apiCreateList,
  apiDeleteList,
  apiFetchLists,
  apiFetchSharedLists,
  apiLeaveSharedList,
  apiRenameList,
  apiShareList,
  apiUnshareList,
} from '../api.js'

// Listas de compras salvas. A lista ativa É o carrinho: trocar de lista grava o
// carrinho na lista anterior e carrega a nova (backend /lists/{id}/activate).

function useShoppingLists(enabled) {
  const { reload: reloadCart } = useCart()
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      setLists(await apiFetchLists())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => { reload() }, [reload])

  // Roda uma ação, recarrega listas (e o carrinho, quando a ação mexe nele).
  async function run(action, { cart = false } = {}) {
    setError('')
    try {
      const result = await action()
      await reload()
      if (cart) await reloadCart()
      return result
    } catch (err) {
      setError(err.message)
      return null
    }
  }

  return {
    lists,
    loading,
    error,
    active: lists.find(l => l.is_active) || null,
    create: (name, empty) => run(() => apiCreateList(name, empty), { cart: empty }),
    activate: id => run(() => apiActivateList(id), { cart: true }),
    rename: (id, name) => run(() => apiRenameList(id, name)),
    remove: id => run(() => apiDeleteList(id)),
    share: (id, email) => run(() => apiShareList(id, email)),
    unshare: (id, userId) => run(() => apiUnshareList(id, userId)),
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** Barra no topo do carrinho: qual lista está aberta, trocar e salvar como nova. */
export function ListSwitcher() {
  const { items, loggedIn } = useCart()
  const { lists, active, error, activate, create } = useShoppingLists(loggedIn)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  if (!loggedIn) return null

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) return
    if (await create(name.trim(), false)) {
      setName('')
      setSaving(false)
    }
  }

  return (
    <div className="list-switcher">
      <label className="list-switcher__field">
        <span className="list-switcher__label">Lista</span>
        <select
          className="toolbar-select"
          value={active?.id ?? ''}
          onChange={e => e.target.value && activate(Number(e.target.value))}
          aria-label="Trocar de lista de compras"
        >
          {!active && <option value="">Carrinho (não salvo)</option>}
          {lists.map(l => (
            <option key={l.id} value={l.id}>{l.name} ({l.is_active ? items.length : l.item_count})</option>
          ))}
        </select>
      </label>

      {saving ? (
        <form className="list-switcher__form" onSubmit={handleSave}>
          <input
            type="text"
            className="list-input"
            placeholder="Nome da lista (ex.: Viagem março)"
            maxLength={80}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-save" disabled={!name.trim()}>Salvar</button>
          <button type="button" className="btn-save btn-save-secondary" onClick={() => setSaving(false)}>Cancelar</button>
        </form>
      ) : (
        <button
          type="button"
          className="btn-save btn-save-secondary"
          onClick={() => setSaving(true)}
          disabled={items.length === 0}
          title={items.length === 0 ? 'Adicione itens ao carrinho antes de salvar' : undefined}
        >
          💾 Salvar como nova lista
        </button>
      )}

      <Link className="list-switcher__manage" to="/conta#listas">Gerenciar e compartilhar</Link>
      {error && <p className="ucm-error list-switcher__error">{error}</p>}
    </div>
  )
}

function ShareForm({ list, onShare, onUnshare }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    if (await onShare(list.id, email.trim())) setEmail('')
    setBusy(false)
  }

  return (
    <div className="list-share">
      <form className="list-share__form" onSubmit={handleSubmit}>
        <input
          type="email"
          className="list-input"
          placeholder="E-mail de quem vai ver esta lista"
          autoComplete="off"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <button type="submit" className="btn-save" disabled={busy || !email.trim()}>Compartilhar</button>
      </form>
      {list.shared_with.length > 0 && (
        <ul className="list-share__people">
          {list.shared_with.map(p => (
            <li key={p.user_id} className="list-share__chip">
              {p.email}
              <button
                type="button"
                className="list-share__remove"
                onClick={() => onUnshare(list.id, p.user_id)}
                aria-label={`Parar de compartilhar com ${p.email}`}
                title="Parar de compartilhar"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ListRow({ list, liveCount, onActivate, onRename, onRemove, onShare, onUnshare }) {
  const count = list.is_active ? liveCount : list.item_count
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(list.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleRename(e) {
    e.preventDefault()
    if (name.trim() && name.trim() !== list.name) await onRename(list.id, name.trim())
    setEditing(false)
  }

  return (
    <li className={`list-row${list.is_active ? ' is-active' : ''}`}>
      <div className="list-row__head">
        {editing ? (
          <form className="list-row__rename" onSubmit={handleRename}>
            <input
              type="text"
              className="list-input"
              maxLength={80}
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-save">OK</button>
          </form>
        ) : (
          <div className="list-row__title">
            <strong>{list.name}</strong>
            {list.is_active && <span className="list-row__badge">No carrinho</span>}
            <span className="list-row__meta">
              {count} {count === 1 ? 'item' : 'itens'} · atualizada {formatDate(list.updated_at)}
            </span>
          </div>
        )}
        <div className="list-row__actions">
          {!list.is_active && (
            <button type="button" className="btn-save btn-save-secondary" onClick={() => onActivate(list.id)}>
              Abrir no carrinho
            </button>
          )}
          {!editing && (
            <button type="button" className="btn-inline btn-muted" onClick={() => { setName(list.name); setEditing(true) }}>
              Renomear
            </button>
          )}
          <button
            type="button"
            className={`btn-inline ${confirmDelete ? 'list-row__delete--confirm' : 'btn-muted'}`}
            onClick={() => (confirmDelete ? onRemove(list.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? 'Confirmar exclusão' : 'Excluir'}
          </button>
        </div>
      </div>
      <ShareForm list={list} onShare={onShare} onUnshare={onUnshare} />
    </li>
  )
}

/** Seção "Listas de compras" em /conta#listas. */
export function ShoppingListsSection() {
  const { items, loggedIn } = useCart()
  const { lists, loading, error, active, create, activate, rename, remove, share, unshare } = useShoppingLists(loggedIn)
  const [shared, setShared] = useState([])
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (!loggedIn) return
    apiFetchSharedLists().then(setShared).catch(() => setShared([]))
  }, [loggedIn])

  const unsavedCart = !active && items.length > 0

  async function handleCreate(empty) {
    if (!newName.trim()) return
    if (await create(newName.trim(), empty)) setNewName('')
  }

  async function handleLeave(id) {
    await apiLeaveSharedList(id).catch(() => {})
    setShared(prev => prev.filter(l => l.id !== id))
  }

  return (
    <section className="ucm-section account-card" id="listas">
      <h3 className="ucm-section-title">Listas de compras</h3>
      <p className="account-card__meta">
        Salve o carrinho como uma lista e alterne entre elas. A lista aberta no carrinho é atualizada
        sozinha. Compartilhe digitando o e-mail de quem tem conta no site: a pessoa só vê a lista, não altera.
      </p>

      {unsavedCart && (
        <p className="list-notice">Seu carrinho atual ({items.length} {items.length === 1 ? 'item' : 'itens'}) ainda não está salvo em nenhuma lista.</p>
      )}

      <form className="list-create" onSubmit={e => { e.preventDefault(); handleCreate(false) }}>
        <input
          type="text"
          className="list-input"
          placeholder="Nome da nova lista"
          maxLength={80}
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button type="submit" className="btn-save" disabled={!newName.trim() || items.length === 0}>
          Salvar carrinho como lista
        </button>
        <button
          type="button"
          className="btn-save btn-save-secondary"
          disabled={!newName.trim() || unsavedCart}
          title={unsavedCart ? 'Salve o carrinho atual antes de começar uma lista vazia' : undefined}
          onClick={() => handleCreate(true)}
        >
          Nova lista vazia
        </button>
      </form>

      {error && <p className="ucm-error">{error}</p>}

      {loading && lists.length === 0 ? (
        <p className="ucm-empty">&hellip;</p>
      ) : lists.length === 0 ? (
        <p className="ucm-empty">Nenhuma lista salva ainda.</p>
      ) : (
        <ul className="list-rows">
          {lists.map(l => (
            <ListRow
              key={l.id}
              list={l}
              liveCount={items.length}
              onActivate={activate}
              onRename={rename}
              onRemove={remove}
              onShare={share}
              onUnshare={unshare}
            />
          ))}
        </ul>
      )}

      <h4 className="list-subtitle">Compartilhadas comigo</h4>
      {shared.length === 0 ? (
        <p className="ucm-empty">Ninguém compartilhou uma lista com você ainda.</p>
      ) : (
        <ul className="list-rows">
          {shared.map(l => (
            <li key={l.id} className="list-row">
              <div className="list-row__head">
                <div className="list-row__title">
                  <strong>{l.name}</strong>
                  <span className="list-row__meta">
                    de {l.owner_name} · {l.item_count} {l.item_count === 1 ? 'item' : 'itens'} · atualizada {formatDate(l.updated_at)}
                  </span>
                </div>
                <div className="list-row__actions">
                  <Link className="btn-save btn-save-secondary" to={`/lista/${l.id}`}>Ver lista</Link>
                  <button type="button" className="btn-inline btn-muted" onClick={() => handleLeave(l.id)}>Remover</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
