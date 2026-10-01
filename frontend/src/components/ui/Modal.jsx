import React, { useEffect, useRef } from 'react'

/**
 * Generic <dialog> shell — consolidates the dialogRef/showModal/close/backdrop-click
 * boilerplate that every existing modal (AuthModal, ReportModal, OffersDialog, etc.)
 * currently hand-rolls. Reuses the CSS classes already defined in styles.css
 * (`.modal`, `.modal-sm/-md/-lg/-xl`, `.modal-header`, `.modal-title`, `.modal-close`,
 * `.modal-body`) — that system is already consistent, only the JS wiring was duplicated.
 *
 * Existing dialogs are NOT migrated to this component as part of this pass — only
 * new dialogs introduced by later phases should use it.
 */
export default function Modal({ open, onClose, size = 'sm', title, className = '', children }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) onClose?.()
  }

  return (
    <dialog
      ref={dialogRef}
      className={`modal modal-${size} ${className}`.trim()}
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      {title && (
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
      )}
      <div className="modal-body">
        {children}
      </div>
    </dialog>
  )
}
