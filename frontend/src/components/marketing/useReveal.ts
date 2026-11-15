import { useEffect, useRef, useState } from 'react';

/**
 * Shared scroll-reveal primitives for the marketing pages (/, /tour). Kept
 * deliberately dependency-free (no animation library) — a small
 * IntersectionObserver hook plus a couple of CSS custom properties/classes
 * defined in index.css and src/styles/landing.css do all the work.
 *
 * Pre-render safety: every hook here starts from a value that is correct with
 * no JavaScript at all (motion "ready", reveal "in view") and only *adds* a
 * hidden pre-reveal state once mounted in a real browser — never the other
 * way round. That keeps pre-rendered HTML (and no-JS visitors) showing full,
 * final content, per the landing page's SEO requirements.
 */

/** True once the component has mounted in a real browser. Used to gate any
 *  hide-then-reveal CSS behind a `motion-ready` class scoped selector so the
 *  pre-rendered markup — and no-JS visitors — always see final content. */
export function useMotionReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * True only when *ambient* motion is appropriate: a wide viewport, a real
 * browser, and no reduced-motion preference.
 *
 * Ambient motion means the looping, never-ending flourishes — the mockup
 * demo cycles, the Ken Burns/drift photos, the scroll-linked parallax. On a
 * phone those loops keep the page moving under the reader's thumb and keep
 * React re-rendering while they scroll, which makes the page feel broken and
 * hard to tap. Every component gated on this already renders a settled,
 * fully-informative frame by default (the same frame no-JS visitors get), so
 * switching the loop off costs nothing but the flourish.
 *
 * One-shot reveals (useReveal) are deliberately NOT gated — they settle.
 */
export function useAmbientMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wide = window.matchMedia('(min-width: 1024px)');
    const update = () => setOn(!reduce.matches && wide.matches);
    update();
    reduce.addEventListener('change', update);
    wide.addEventListener('change', update);
    return () => {
      reduce.removeEventListener('change', update);
      wide.removeEventListener('change', update);
    };
  }, []);
  return on;
}

/**
 * Reveals its children with a subtle fade + slide-up the first time they
 * scroll into view, then stays revealed. Skips the animation entirely (and
 * starts already visible) under `prefers-reduced-motion`, and also resolves
 * immediately — no flash — for elements that are already inside the
 * viewport the moment this hook mounts (e.g. a section that's on-screen as
 * soon as the page loads, or after a deep link/back-navigation scroll
 * restore).
 */
export function useReveal<T extends HTMLElement>(options?: {
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInView(true);
      return;
    }

    // Synchronous check first — an element already on-screen when this runs
    // (rather than one scrolled to later) should never render a hidden frame.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < vh * 0.92 && rect.bottom > 0) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: options?.threshold ?? 0.15, rootMargin: options?.rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, inView };
}

/**
 * Scroll-spy across a set of section refs — reports whichever section has
 * the largest visible intersection ratio above a small threshold, so a
 * pinned/sticky "story" panel can cross-fade to match whatever the visitor
 * is currently reading. Mirrors the chapter scroll-spy already used on
 * /tour's sticky nav.
 */
export function useActiveSection<Id extends string>(ids: readonly Id[]) {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [active, setActive] = useState<Id>(ids[0]!);

  useEffect(() => {
    const sections = ids
      .map((id) => ({ id, el: refs.current[id] }))
      .filter((s): s is { id: Id; el: HTMLElement } => !!s.el);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const ratios = new Map<Id, number>();
        for (const e of entries) {
          const match = sections.find((s) => s.el === e.target);
          if (match) ratios.set(match.id, e.intersectionRatio);
        }
        const best = sections.reduce<{ id: Id; ratio: number }>(
          (acc, s) => {
            const r = ratios.get(s.id) ?? -1;
            return r > acc.ratio ? { id: s.id, ratio: r } : acc;
          },
          { id: sections[0]!.id, ratio: -1 },
        );
        if (best.ratio > 0.2) setActive(best.id);
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0.21, 0.4, 0.6, 0.8] },
    );
    for (const { el } of sections) observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|')]);

  function setRef(id: Id) {
    return (el: HTMLElement | null) => {
      refs.current[id] = el;
    };
  }

  return { active, setRef };
}
