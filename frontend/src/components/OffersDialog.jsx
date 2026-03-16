import React, { useEffect, useRef } from 'react'
import { useI18n } from '../i18n.jsx'
import { formatMoney, sourceDomain } from '../utils.js'

function CountryBadge({ country }) {
  const c = (country || '').toLowerCase()
  if (c === 'py') return <span className="badge-country badge-py">Paraguay</span>
  if (c === 'br') return <span className="badge-country badge-br">Brazil</span>
  return <span className="badge-country">Unknown</span>
}

export default function OffersDialog({ group, name, config, onClose }) {
  const { t } = useI18n()
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
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

  return (
    <dialog
      ref={dialogRef}
      className="offers-dialog"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="od-header">
        <div className="od-title-wrap">
          <span className="od-name">{name}</span>
          {config && <span className="od-chip">{config}</span>}
        </div>
        <button className="od-close" aria-label="Close" onClick={handleClose}>
          &times;
        </button>
      </div>
      <div className="od-body">
        <table className="offers-inner">
          <thead>
            <tr>
              <th>{t('table.country')}</th>
              <th>{t('table.store')}</th>
              <th>{t('table.title')}</th>
              <th>{t('table.price')}</th>
              <th>{t('table.brl')}</th>
              <th>{t('table.link')}</th>
            </tr>
          </thead>
          <tbody>
            {group.offers.map((offer, i) => (
              <tr key={i}>
                <td><CountryBadge country={offer.country} /></td>
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
            ))}
          </tbody>
        </table>
      </div>
    </dialog>
  )
}
