import { useToastContext } from './Toast.jsx'

/** Returns a `show(message, variant?, duration?)` function. Requires <ToastProvider> above in the tree. */
export default function useToast() {
  const show = useToastContext()
  if (!show) {
    // eslint-disable-next-line no-console
    console.warn('useToast() called without a <ToastProvider> ancestor')
    return () => {}
  }
  return show
}
