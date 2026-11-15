import { useState, useCallback } from 'react';
import type { ToastType } from '../components/Toast';

export interface ToastState {
  id: string;
  message: string;
  type: ToastType;
}

/**
 * State store for active toasts. Used by ToastProvider; consumers should call
 * `useToast()` (from contexts/ToastContext) instead of this hook directly.
 */
export function useToastState() {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}
