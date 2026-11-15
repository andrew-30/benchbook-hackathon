import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * Institution field for onboarding — a University/Independent toggle backed
 * by a search-as-you-type combobox over a bundled ~10k-entry university
 * dataset (`public/universities.json`, `[name, country]` tuples).
 *
 * The dataset is fetched lazily on first focus of the search input (never
 * bundled into the main JS) and cached at module scope so repeated mounts
 * within a session reuse it. Whatever text is in the box IS the submitted
 * value — the dropdown is a suggestion list, not a hard constraint, so
 * institutions outside the dataset (companies, hospitals, institutes) still
 * work as free text.
 */

type University = [name: string, country: string];

let universitiesCache: University[] | null = null;
let universitiesPromise: Promise<University[]> | null = null;

function loadUniversities(): Promise<University[]> {
  if (universitiesCache) return Promise.resolve(universitiesCache);
  if (universitiesPromise) return universitiesPromise;
  universitiesPromise = fetch('/universities.json')
    .then((res) => {
      if (!res.ok) throw new Error('failed to load universities.json');
      return res.json() as Promise<University[]>;
    })
    .then((data) => {
      universitiesCache = data;
      return data;
    })
    .catch((err) => {
      // Allow a later focus (e.g. a different field instance) to retry.
      universitiesPromise = null;
      throw err;
    });
  return universitiesPromise;
}

/** Prefix matches first, then any-position matches; case-insensitive. */
function filterUniversities(list: University[], rawQuery: string, limit = 8): University[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  const starts: University[] = [];
  const contains: University[] = [];
  for (const entry of list) {
    const idx = entry[0].toLowerCase().indexOf(query);
    if (idx === 0) starts.push(entry);
    else if (idx > 0) contains.push(entry);
    if (starts.length >= limit) break;
  }
  return starts.length >= limit ? starts.slice(0, limit) : [...starts, ...contains].slice(0, limit);
}

type FieldType = 'university' | 'independent';

interface InstitutionFieldProps {
  /**
   * Seeds the initial University/Independent toggle + search text on mount
   * (via a `useState` initializer) — this is effectively an `initialValue`,
   * not a controlled value; the field owns its text after that and reports
   * changes through `onChange`. That makes it safe to reuse for *editing* an
   * existing profile (Settings → Profile) as long as the caller doesn't
   * render `<InstitutionField>` until the real value has loaded — mount it
   * behind a loading guard, don't flip `value` on an already-mounted field
   * and expect it to react.
   */
  value: string;
  onChange: (value: string) => void;
}

export function InstitutionField({ value, onChange }: InstitutionFieldProps) {
  const [type, setType] = useState<FieldType>(value === 'Independent' ? 'independent' : 'university');
  const [query, setQuery] = useState(value === 'Independent' ? '' : value);
  const [dataset, setDataset] = useState<University[] | null>(universitiesCache);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<University[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Debounced filter — recompute ~150ms after the query settles.
  useEffect(() => {
    if (!dataset) {
      setResults([]);
      return;
    }
    const q = query.trim();
    if (!q) {
      setResults([]);
      setActiveIndex(-1);
      return;
    }
    const t = window.setTimeout(() => {
      setResults(filterUniversities(dataset, q));
      setActiveIndex(-1);
    }, 150);
    return () => window.clearTimeout(t);
  }, [query, dataset]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function selectType(next: FieldType) {
    if (next === type) return;
    setType(next);
    setOpen(false);
    setActiveIndex(-1);
    onChange(next === 'independent' ? 'Independent' : query);
  }

  function handleQueryChange(v: string) {
    setQuery(v);
    onChange(v);
    setOpen(true);
  }

  function handleFocus() {
    setOpen(true);
    if (!universitiesCache && !loading && !loadFailed) {
      setLoading(true);
      loadUniversities()
        .then((data) => {
          setDataset(data);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
          setLoadFailed(true);
        });
    }
  }

  function selectResult(entry: University) {
    setQuery(entry[0]);
    onChange(entry[0]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (!results.length) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        selectResult(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  }

  const showDropdown = type === 'university' && open && (results.length > 0 || loading);
  const activeId = activeIndex >= 0 ? `institution-option-${activeIndex}` : undefined;

  return (
    <div>
      <label htmlFor="institution" id="institution-label" className="bb-label">Institution</label>

      <div className="mb-2 inline-flex rounded-full border border-line bg-neutral-50 p-1" role="group" aria-labelledby="institution-label">
        <button
          type="button"
          aria-pressed={type === 'university'}
          onClick={() => selectType('university')}
          className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition-colors ${
            type === 'university' ? 'bg-primary text-white' : 'text-muted hover:text-ink'
          }`}
        >
          University
        </button>
        <button
          type="button"
          aria-pressed={type === 'independent'}
          onClick={() => selectType('independent')}
          className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition-colors ${
            type === 'independent' ? 'bg-primary text-white' : 'text-muted hover:text-ink'
          }`}
        >
          Independent
        </button>
      </div>

      {type === 'independent' ? (
        <div className="flex min-h-[52px] items-center gap-2 rounded-card border border-line bg-neutral-50 px-3 text-sm text-muted">
          <Icon name="check" size={16} className="shrink-0 text-primary" />
          No institution needed — set as "Independent"
        </div>
      ) : (
        <div ref={containerRef} className="relative" onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}>
          <div className="relative">
            <input
              id="institution"
              type="text"
              role="combobox"
              aria-labelledby="institution-label"
              aria-autocomplete="list"
              aria-expanded={showDropdown}
              aria-controls="institution-listbox"
              aria-activedescendant={showDropdown ? activeId : undefined}
              autoComplete="off"
              className="bb-input pr-9"
              placeholder="Search for your university…"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={handleFocus}
              onKeyDown={handleKeyDown}
            />
            {loading && (
              <span
                aria-hidden
                className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-primary"
              />
            )}
          </div>

          {showDropdown && (
            <ul
              id="institution-listbox"
              role="listbox"
              aria-label="University suggestions"
              ref={listRef}
              className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-card border border-line bg-white py-1 shadow-lg"
            >
              {loading && results.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted" aria-disabled="true">Loading universities…</li>
              )}
              {results.map((entry, i) => (
                <li
                  key={`${entry[0]}-${entry[1]}`}
                  id={`institution-option-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectResult(entry)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                    i === activeIndex ? 'bg-primary/10' : 'hover:bg-neutral-50'
                  }`}
                >
                  <span className="truncate font-medium text-ink">{entry[0]}</span>
                  <span className="shrink-0 text-xs text-muted">{entry[1]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
