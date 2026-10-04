import React, { useEffect, useMemo, useState } from 'react'
import { apiFetchPyStoreNames } from '../api.js'

/** Pré-filtro de busca (/conta#lojas): lojas do Paraguai em que o usuário quer focar.
 *  Na busca, essas lojas já vêm marcadas no filtro "Loja" e o card mostra o menor
 *  preço entre elas (ResultsArea). */
export default function PreferredStoresSection({ preferred, onChange }) {
  const [stores, setStores] = useState([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(() => new Set(preferred))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiFetchPyStoreNames().then(setStores).catch(() => setStores([]))
  }, [])

  const preferredKey = preferred.join('\n')
  useEffect(() => { setSelected(new Set(preferred)) }, [preferredKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // loja salva que sumiu do catálogo continua na lista pra poder desmarcar
  const all = useMemo(
    () => [...new Set([...preferred, ...stores])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [stores, preferredKey], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const needle = filter.trim().toLowerCase()
  const visible = needle ? all.filter(s => s.toLowerCase().includes(needle)) : all
  const dirty = selected.size !== preferred.length || preferred.some(s => !selected.has(s))

  function toggle(name) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  async function save(list) {
    setSaving(true)
    await onChange({ preferred_stores: list })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section className="ucm-section account-card" id="lojas">
      <h3 className="ucm-section-title">Lojas preferidas</h3>
      <p className="account-card__meta">
        Marque as lojas do Paraguai em que você costuma comprar. Nas buscas, o filtro de loja já vem com
        elas marcadas e o preço de cada produto é o menor entre essas lojas. Dá para desmarcar na própria
        busca quando quiser ver todas.
      </p>

      <input
        type="search"
        className="list-input"
        placeholder={`Procurar entre ${all.length} lojas`}
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      <div className="pref-stores">
        {visible.map(name => (
          <label key={name} className={`pref-store${selected.has(name) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={selected.has(name)} onChange={() => toggle(name)} />
            <span>{name}</span>
          </label>
        ))}
        {visible.length === 0 && <p className="ucm-empty">Nenhuma loja encontrada.</p>}
      </div>

      <div className="pref-stores__footer">
        <span className="pref-stores__count">
          {selected.size === 0 ? 'Nenhuma loja marcada — a busca mostra todas.' : `${selected.size} ${selected.size === 1 ? 'loja marcada' : 'lojas marcadas'}`}
        </span>
        {selected.size > 0 && (
          <button type="button" className="btn-inline btn-muted" onClick={() => setSelected(new Set())}>Desmarcar todas</button>
        )}
        <button type="button" className="btn-save" disabled={saving || !dirty} onClick={() => save([...selected])}>
          {saved ? 'Salvo!' : 'Salvar lojas'}
        </button>
      </div>
    </section>
  )
}
