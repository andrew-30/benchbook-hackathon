import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon, type IconName } from './Icon';

export interface OverflowMenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  /** Renders the item in the danger colour (e.g. Delete). */
  destructive?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** Accessible name for both the trigger button and the menu it opens,
   *  e.g. `More actions for Western blot — phospho-AKT`. */
  label: string;
  /** Override the trigger button's classes (defaults to a bordered icon button). */
  triggerClassName?: string;
}

/**
 * "⋯" overflow menu — WAI-ARIA menu-button pattern. Used to tuck secondary /
 * destructive card actions (Archive, Delete) out of the primary action row.
 *
 * Keyboard: ArrowDown/ArrowUp move between items (with wraparound), Escape
 * closes and returns focus to the trigger. Mouse: clicking outside, or focus
 * leaving the component entirely, closes it.
 */
export function OverflowMenu({ items, label, triggerClassName }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    // Move focus into the menu as soon as it opens — matches the ARIA
    // authoring-practices menu-button pattern regardless of activation method.
    itemRefs.current[0]?.focus();

    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onTriggerKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function onItemKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      itemRefs.current[(index + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      itemRefs.current[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={
          triggerClassName ??
          'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-card border border-line bg-white text-muted transition hover:bg-neutral-50 hover:text-ink focus:outline-none focus:ring-2 focus:ring-primary/30'
        }
      >
        <Icon name="more" size={18} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="bb-animate-scale absolute right-0 top-[calc(100%+6px)] z-20 w-48 origin-top-right rounded-card border border-line bg-white p-1.5 shadow-lg"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              role="menuitem"
              type="button"
              tabIndex={-1}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              onKeyDown={(e) => onItemKeyDown(e, index)}
              className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left text-sm font-medium transition ${
                item.destructive
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-ink hover:bg-neutral-50'
              }`}
            >
              {item.icon && <Icon name={item.icon} size={16} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
