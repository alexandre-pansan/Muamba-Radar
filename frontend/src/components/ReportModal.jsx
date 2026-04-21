import React, { useEffect, useRef, useState } from 'react'
import { apiSubmitReport } from '../api.js'

const REPORT_TYPES = [
  { value: 'wrong_price', label: 'Preço incorreto' },
  { value: 'wrong_store', label: 'Loja incorreta ou inexistente' },
  { value: 'missing_info', label: 'Informação faltando' },
  { value: 'other', label: 'Outro' },
]

export default function ReportModal({ open, onClose, productTitle, offerUrl, snapshot, currentUser }) {
  const dialogRef = useRef(null)
  const [reportType, setReportType] = useState('wrong_price')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null) // null | 'sending' | 'ok' | 'error'

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setStatus(null)
      setDescription('')
      setReportType('wrong_price')
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    try {
      await apiSubmitReport({
        report_type: reportType,
        product_title: productTitle,
        offer_url: offerUrl || null,
        description,
        reporter_email: !currentUser && email ? email : null,
        snapshot: snapshot || null,
      })
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-sm"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="modal-header">
        <h2 className="modal-title">Reportar dado incorreto</h2>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>✕</button>
      </div>

      <div className="modal-body" style={{ padding: '1rem 1.25rem' }}>
        {status === 'ok' ? (
          <div className="report-success">
            <p className="report-success-title">Obrigado por nos informar!</p>
            <p className="report-success-body">Vamos verificar e corrigir o mais rápido possível.</p>
            <button className="btn-primary" onClick={onClose} style={{ marginTop: '0.75rem' }}>Fechar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="report-product-label">{productTitle}</div>

            <div className="form-group">
              <label className="form-label">Tipo de problema</label>
              <select
                className="form-select"
                value={reportType}
                onChange={e => setReportType(e.target.value)}
              >
                {REPORT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Descrição</label>
              <textarea
                className="form-textarea"
                placeholder="Descreva o problema (ex: preço está errado, loja não existe mais...)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                required
                minLength={5}
                maxLength={1000}
              />
            </div>

            {!currentUser && (
              <div className="form-group">
                <label className="form-label">Seu email (opcional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="para retorno, se necessário"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  maxLength={200}
                />
              </div>
            )}

            {status === 'error' && (
              <p className="report-error">Erro ao enviar. Tente novamente.</p>
            )}

            <button
              type="submit"
              className="btn-primary report-submit-btn"
              disabled={status === 'sending' || description.length < 5}
            >
              {status === 'sending' ? 'Enviando…' : 'Enviar reporte'}
            </button>
          </form>
        )}
      </div>
    </dialog>
  )
}
