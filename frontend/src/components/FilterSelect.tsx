import { Icon } from './Icon';

/**
 * Compact <select> for list-page filter bars (Protocols, My Experiments).
 * The label is screen-reader only — the first option names the filter
 * ("All categories", "Any usage", …) so the bar stays one tidy row.
 */
export function FilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative min-w-[150px] flex-1 sm:flex-none">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="bb-input cursor-pointer appearance-none pr-9"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">
        <Icon name="chevron-down" size={15} />
      </span>
    </div>
  );
}
