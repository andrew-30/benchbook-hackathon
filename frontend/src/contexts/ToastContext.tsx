import { createContext, useContext } from 'react';
import { Toast } from '../components/Toast';
import { useToastState } from '../hooks/useToast';
import type { ToastType } from '../components/Toast';

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Renders the toast stack in a fixed container (top-right on desktop,
 * top-center on mobile) and exposes `showToast` to any descendant via
 * `useToast()`.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, showToast, removeToast } = useToastState();
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="
          fixed z-50 flex flex-col gap-2 pointer-events-none
          top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm
          md:left-auto md:right-4 md:translate-x-0 md:w-auto md:max-w-md
        "
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast
              message={t.message}
              type={t.type}
              onClose={() => removeToast(t.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft fallback — components rendered outside the provider (e.g. /shared/:token
    // before the provider mounts) get a no-op rather than a crash.
    return { showToast: () => {} };
  }
  return ctx;
}
