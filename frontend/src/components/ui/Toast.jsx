import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

/**
 * Mount once near the app root. Provides a `show(message, variant?, duration?)`
 * function via useToast() — a singleton toast, matching the prototype's showToast().
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null) // { message, variant }
  const timeoutRef = useRef(null)

  const show = useCallback((message, variant = 'default', duration = 3000) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setToast({ message, variant })
    timeoutRef.current = setTimeout(() => setToast(null), duration)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          className={`ui-toast ui-toast--${toast.variant} is-active`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToastContext() {
  return useContext(ToastContext)
}
