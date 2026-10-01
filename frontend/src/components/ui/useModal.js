import { useCallback, useState } from 'react'

export default function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  return { isOpen, open, close }
}
