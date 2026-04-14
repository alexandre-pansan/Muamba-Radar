import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useI18n } from '../i18n.jsx'
import { formatMoney, sourceDomain } from '../utils.js'

export default function OffersDialog({ group, name, config, onClose }) {
  const { t } = useI18n()
  const dialogRef = useRef(null)
  const [storeFilter, setStoreFilter] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      setTimeout(() => dialog.querySelector('button')?.focus(), 50)
    }
  }, [])

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) {
      dialogRef.current.close()
      onClose()
    }
  }

  function handleClose() {
    if (dialogRef.current) {
      dialogRef.current.close()
    }
    onClose()
  }

  const stores = useMemo(() => {
    const map = {}
    group.offers.forEach(o => {
      if (o.store) map[o.store] = (map[o.store] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [group.offers])

  const filtered = storeFilter
    ? group.offers.filter(o => o.store === storeFilter)
    : group.offers

  const pyOffers = filtered.filter(o => (o.country || '').toLowerCase() === 'py')
  const brOffers = filtered.filter(o => (o.country || '').toLowerCase() === 'br')

  function OfferRows({ offers, countryClass }) {
    return offers.map((offer, i) => (
      <tr key={i} className={`od-row od-row--${countryClass}`}>
        <td className="od-store">{offer.store}</td>
        <td className="od-title" title={offer.title || ''}>{offer.title || ''}</td>
        <td className="od-price">{formatMoney(offer.price.amount, offer.price.currency)}</td>
        <td className="od-brl">{formatMoney(offer.price.amount_brl, 'BRL')}</td>
        <td className="od-link">
          <a href={offer.url} target="_blank" rel="noopener noreferrer">
            {sourceDomain(offer.url)}
          </a>
        </td>
      </tr>
    ))
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-xl"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="modal-header">
        <div className="od-title-wrap">
          <span className="od-name">{name}</span>
          {config && <span className="od-chip">{config}</span>}
        </div>
        <div className="od-counts">
          {pyOffers.length > 0 && <span className="od-count-badge od-count-py">{pyOffers.length} PY</span>}
          {brOffers.length > 0 && <span className="od-count-badge od-count-br">{brOffers.length} BR</span>}
        </div>
        <button className="modal-close" type="button" aria-label="Fechar" onClick={handleClose}>
          &times;
        </button>
      </div>

      {stores.length > 1 && (
        <div className="od-store-filter">
          <button
            className={`od-store-chip${!storeFilter ? ' is-active' : ''}`}
            onClick={() => setStoreFilter(null)}
          >
            Todas <span className="od-store-chip-count">{group.offers.length}</span>
          </button>
          {stores.map(([store, count]) => (
            <button
              key={store}
              className={`od-store-chip${storeFilter === store ? ' is-active' : ''}`}
              onClick={() => setStoreFilter(s => s === store ? null : store)}
            >
              {store} <span className="od-store-chip-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="modal-body">
        <table className="offers-inner">
          <thead>
            <tr>
              <th>{t('table.store')}</th>
              <th>{t('table.title')}</th>
              <th>{t('table.price')}</th>
              <th>{t('table.brl')}</th>
              <th>{t('table.link')}</th>
            </tr>
          </thead>
          <tbody>
            {pyOffers.length > 0 && (
              <>
                <tr className="od-section-row">
                  <td colSpan={5} className="od-section-label od-section-py">Paraguai</td>
                </tr>
                <OfferRows offers={pyOffers} countryClass="py" />
              </>
            )}
            {brOffers.length > 0 && (
              <>
                <tr className="od-section-row">
                  <td colSpan={5} className="od-section-label od-section-br">Brasil</td>
                </tr>
                <OfferRows offers={brOffers} countryClass="br" />
              </>
            )}
            {pyOffers.length === 0 && brOffers.length === 0 && (
              <tr>
                <td colSpan={5} className="od-empty">Nenhuma oferta para "{storeFilter}"</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </dialog>
  )
}
