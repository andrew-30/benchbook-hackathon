import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  duration?: number;
  onClose: () => void;
}

const COLOURS: Record<ToastType, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-indigo-600 text-white',
};

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
};

/**
 * Single toast pill. Lives top-right on tablet+, top-center on mobile.
 * Slides down on enter, slides up on exit. Auto-dismisses after `duration`.
 */
export function Toast({ message, type, duration = 3000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(false);

  // Slide-in on mount.
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss.
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      // Wait for the exit transition before unmounting.
      setTimeout(onClose, 200);
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  function dismiss() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  return (
    <div
      role="status"
      className={`
        flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg
        transition-all duration-200 ease-out
        ${COLOURS[type]}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
      `}
    >
      <span className="text-lg font-bold leading-none">{ICONS[type]}</span>
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={dismiss}
        className="ml-2 opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
