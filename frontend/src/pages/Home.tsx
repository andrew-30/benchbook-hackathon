import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { BrandMark } from '../components/BrandMark';
import { ScreenFrame } from '../components/marketing/ScreenFrame';
import {
  useReveal,
  usePrefersReducedMotion,
  useAmbientMotion,
  useActiveSection,
} from '../components/marketing/useReveal';
import '../styles/landing.css';

/**
 * Public marketing landing page, served at "/" to logged-out visitors and
 * pre-rendered to static HTML for SEO. Deliberately free of data fetching,
 * auth, and any window/document access at module scope or during render —
 * this component is rendered with `renderToString` inside a `StaticRouter`
 * in Node (see the pre-render script). Modern Confident skin, matching
 * /login, /about and /why-benchbook.
 *
 * Motion system: every hide-then-reveal rule lives in src/styles/landing.css
 * scoped under `.landing.motion-ready` (added only after a real browser has
 * mounted — see the `ready` state below) or under a component-local "ready"
 * class using the exact same pattern PageTransition already uses elsewhere
 * in the app (start visible when there's no `window`, flip a class after
 * mount). No-JS visitors and the pre-rendered HTML always get the final,
 * fully visible layout.
 */
export function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <div className={`landing min-h-screen bg-canvas ${ready ? 'motion-ready' : ''}`}>
      <Header />
      <main>
        <Hero />
        <ProblemBeat />
        <StoryScroll />
        <BenchBand />
        <ReagentBand />
        <HowItWorks />
        <CompleteRecords />
        <FAQSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: responsive AVIF/WebP photo
// ---------------------------------------------------------------------------

function Photo({
  basePath,
  widths,
  width,
  height,
  alt,
  sizes,
  loading = 'lazy',
  className = '',
}: {
  basePath: string;
  widths: [number, number];
  width: number;
  height: number;
  alt: string;
  sizes: string;
  loading?: 'eager' | 'lazy';
  className?: string;
}) {
  const avifSrcSet = widths.map((w) => `${basePath}-${w}.avif ${w}w`).join(', ');
  const webpSrcSet = widths.map((w) => `${basePath}-${w}.webp ${w}w`).join(', ');
  return (
    <picture>
      <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
      <img
        src={`${basePath}-${widths[0]}.webp`}
        srcSet={webpSrcSet}
        sizes={sizes}
        width={width}
        height={height}
        alt={alt}
        loading={loading}
        decoding="async"
        className={className}
      />
    </picture>
  );
}

// ---------------------------------------------------------------------------
// Header — sticky, frosted glass once scrolled
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { to: '/why-benchbook', label: 'Why Benchbook' },
  { to: '/about', label: 'About' },
];

function useHeaderScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > threshold);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

function Header() {
  const scrolled = useHeaderScrolled();
  return (
    <header
      className={`landing-header sticky top-0 z-30 border-b backdrop-blur ${
        scrolled ? 'is-scrolled border-line bg-white/90 backdrop-blur-md' : 'border-transparent bg-white/60'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link to="/" className="shrink-0" aria-label="Benchbook home">
          <BrandMark />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/login"
            className="hidden min-h-[44px] items-center px-3 text-sm font-medium text-ink hover:text-primary sm:inline-flex"
          >
            Sign in
          </Link>
          <Link to="/login" className="bb-btn-primary min-h-[44px] px-4 text-sm">
            Get started free
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero — headline rises word by word, CTAs fade in, live-run mockup scales in
// ---------------------------------------------------------------------------

const HEADLINE = 'Turn laboratory protocols into reproducible experiments';

function Hero() {
  // Same battle-tested pattern as PageTransition: visible immediately when
  // there's no `window` (pre-render / no-JS), hidden-then-revealed once a
  // real browser has painted the initial frame.
  const [ready, setReady] = useState(() => typeof window === 'undefined');
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 10);
    return () => clearTimeout(t);
  }, []);

  const words = HEADLINE.split(' ');

  return (
    <section
      className={`hero relative overflow-hidden px-6 pt-14 pb-20 md:pt-20 md:pb-28 ${ready ? 'hero-ready' : ''}`}
      style={{ background: 'linear-gradient(160deg, #ecedff 0%, #f5f5ff 48%, #ffffff 100%)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl md:left-auto md:right-0 md:translate-x-1/4"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Icon name="flask" size={14} />
            The execution layer for reproducible science
          </span>
          <h1 className="mt-5 text-4xl leading-[1.15] text-ink md:text-5xl">
            {words.map((w, i) => (
              <span key={i} className="hero-word" style={{ '--w-i': i } as CSSProperties}>
                {w}
                {i < words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted lg:mx-0">
            Benchbook guides you through the protocol at the bench and captures
            the run as it happens — every measurement, timer, deviation and
            reagent lot. It is an experiment execution platform that records
            the experiment while you do it, instead of after.
          </p>
          <div className="hero-cta mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Link to="/login" className="bb-btn-primary min-h-[52px] px-6 text-base">
              Get started free
              <Icon name="arrow-right" size={18} />
            </Link>
            <Link to="/why-benchbook" className="bb-btn-ghost min-h-[52px] px-6 text-base">
              See how it works
              <Icon name="arrow-right" size={18} />
            </Link>
          </div>
          <p className="hero-cta mt-4 text-sm text-muted">
            Free to use. No credit card needed.
          </p>
        </div>

        <div className="hero-mockup relative mx-auto w-full max-w-md">
          <div aria-hidden className="absolute -inset-10 -z-10 overflow-hidden rounded-[32px]">
            <Photo
              basePath="/landing/hero-bench"
              widths={[800, 1600]}
              width={1600}
              height={1067}
              alt=""
              sizes="(min-width: 1024px) 520px, 90vw"
              loading="eager"
              className="hero-photo h-full w-full object-cover opacity-80"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(120% 100% at 50% 30%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.85) 65%, #ffffff 100%)',
              }}
            />
          </div>
          <ScreenFrame path="runs/current/execute" contentClassName="bg-slate-900">
            <RunScreenContent />
          </ScreenFrame>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Problem + insight — the beat that earns the hero's claim
// ---------------------------------------------------------------------------

function ProblemBeat() {
  const { ref, inView } = useReveal<HTMLDivElement>();
  return (
    <section aria-labelledby="problem-heading" className="px-6 py-16 md:py-24">
      <div ref={ref} className="mx-auto max-w-3xl text-center">
        <h2
          id="problem-heading"
          className={`reveal ${inView ? 'is-in' : ''} text-3xl leading-tight text-ink md:text-4xl`}
          style={{ '--reveal-i': 0 } as CSSProperties}
        >
          The protocol isn't the experiment
        </h2>
        <div
          className={`reveal ${inView ? 'is-in' : ''} mt-5 space-y-4 text-lg leading-relaxed text-muted`}
          style={{ '--reveal-i': 1 } as CSSProperties}
        >
          <p>
            A protocol describes what should happen. The experiment is what
            actually happened — the incubation that ran four minutes long, the
            reading that came in high, the lot you swapped in when the first
            tube ran out. That is the part that decides whether anyone can
            reproduce the result, and it is the part that usually never gets
            written down.
          </p>
          <p>
            Reproducibility starts at the bench, not in the write-up weeks
            later. So Benchbook sits where the work happens: it guides the run,
            and records it as you go.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared mockup: live run screen (hero + "Run" story chapter)
// ---------------------------------------------------------------------------

function RunScreenContent() {
  const animate = useAmbientMotion();
  // Default state is the "settled" demo frame — informative and fully
  // visible with no JavaScript at all. The effect below resets and replays
  // the tick/pop-in sequence as a looping flourish, but only on wide screens:
  // on mobile all five story chapters are on the page at once, so looping
  // every mockup means several timers re-rendering under the reader's thumb.
  const [seconds, setSeconds] = useState(4 * 60 + 59);
  const [checked, setChecked] = useState(true);
  const [badge, setBadge] = useState(true);

  useEffect(() => {
    if (!animate) return;
    const tick = setInterval(() => {
      setSeconds((s) => (s <= 4 * 60 + 39 ? 4 * 60 + 59 : s - 1));
    }, 1000);
    let timers: ReturnType<typeof setTimeout>[] = [];
    function cycle() {
      setChecked(false);
      setBadge(false);
      timers.push(setTimeout(() => setChecked(true), 2200));
      timers.push(setTimeout(() => setBadge(true), 3000));
      timers.push(setTimeout(cycle, 7200));
    }
    cycle();
    return () => {
      clearInterval(tick);
      timers.forEach(clearTimeout);
    };
  }, [animate]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="overflow-hidden p-5 text-white">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Step 3 of 8</span>
        <span>Cell Lysis &amp; Western Blot</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-primary" style={{ width: '37%' }} />
      </div>
      <div className="bb-card mt-4 border-slate-700 bg-slate-800 p-4 text-white">
        <div className="text-xs font-medium tracking-wide text-indigo-300 uppercase">
          Incubate at 37 °C
        </div>
        <p className="mt-1 text-sm">
          Transfer plate to the 37 °C incubator for 5 minutes with gentle
          agitation.
        </p>
      </div>
      <div className="bb-card mt-4 border-slate-700 bg-slate-800 p-4 text-white">
        <div className="flex items-center justify-between text-xs tracking-wide text-slate-400 uppercase">
          <span>Timer (strict)</span>
          <span className="text-slate-500">target 5m</span>
        </div>
        <div
          className="tabular-digits mt-2 font-mono leading-none font-bold text-white"
          style={{ fontSize: 'clamp(34px, 6vw, 46px)' }}
        >
          {mm}:{ss}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-200">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
              checked ? 'border-primary bg-primary' : 'border-slate-600'
            }`}
            aria-hidden
          >
            {checked && <Icon name="check" size={13} className="text-white" />}
          </span>
          Step complete
        </label>
      </div>
      {badge && (
        <div className="bb-pop-in mt-3 flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
          <Icon name="check" size={14} />
          pH 7.42 · within tolerance
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story mockup: Import
// ---------------------------------------------------------------------------

const IMPORT_STEPS = [
  '1. Lyse cells in RIPA buffer with protease inhibitors',
  '2. Centrifuge at 14,000g for 10 min at 4 °C',
  '3. Load 20 µg protein per lane on SDS-PAGE',
  '4. Transfer to PVDF membrane at 100V, 60 min',
  '5. Block in 5% milk-TBST for 1 hour',
];

function ImportScreenContent() {
  const animate = useAmbientMotion();
  const [phase, setPhase] = useState<'idle' | 'extracting' | 'done'>('done');
  const [stepsShown, setStepsShown] = useState(IMPORT_STEPS.length);

  useEffect(() => {
    if (!animate) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    function cycle() {
      setPhase('idle');
      setStepsShown(0);
      timers.push(setTimeout(() => setPhase('extracting'), 700));
      IMPORT_STEPS.forEach((_, i) =>
        timers.push(setTimeout(() => setStepsShown(i + 1), 700 + (i + 1) * 260)),
      );
      const doneAt = 700 + IMPORT_STEPS.length * 260 + 250;
      timers.push(setTimeout(() => setPhase('done'), doneAt));
      timers.push(setTimeout(cycle, doneAt + 3400));
    }
    cycle();
    return () => timers.forEach(clearTimeout);
  }, [animate]);

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Icon name="file" size={14} />
        Western_Blot_Protocol.docx
        {phase !== 'idle' && <Icon name="sparkles" size={14} className="ml-auto text-primary" />}
      </div>

      {phase === 'idle' && (
        <div className="mt-3 rounded-card border-2 border-dashed border-primary/25 bg-primary/5 px-4 py-8 text-center">
          <Icon name="file" size={26} className="inline-block text-primary/60" />
          <p className="mt-2 text-xs text-muted">Extracting steps and materials…</p>
        </div>
      )}

      {phase !== 'idle' && (
        <ul className="mt-3 space-y-1.5">
          {IMPORT_STEPS.slice(0, stepsShown).map((s) => (
            <li key={s} className="bb-animate-slide rounded bg-primary/5 px-3 py-1.5 text-xs text-ink/80">
              {s}
            </li>
          ))}
        </ul>
      )}

      {phase === 'done' && (
        <div className="bb-animate-fade mt-3 flex items-center gap-2 rounded-card border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <Icon name="check" size={14} />8 steps · 3 reagents extracted
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story mockup: Validate
// ---------------------------------------------------------------------------

function ValidateScreenContent() {
  const animate = useAmbientMotion();
  const [flagged, setFlagged] = useState(true);

  useEffect(() => {
    if (!animate) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    function cycle() {
      setFlagged(false);
      timers.push(setTimeout(() => setFlagged(true), 1400));
      timers.push(setTimeout(cycle, 5600));
    }
    cycle();
    return () => timers.forEach(clearTimeout);
  }, [animate]);

  return (
    <div className="p-5 md:p-6">
      <div className="text-sm font-medium text-ink">Voltage (V)</div>
      <div
        className={`mt-2 rounded-card border px-4 py-3 text-center font-mono text-lg tabular-nums transition-colors duration-150 ${
          flagged ? 'border-amber-300 bg-amber-50' : 'border-line bg-white'
        }`}
      >
        5.85
      </div>
      <p className="mt-2 text-xs text-muted">Target: 5.0 ± 0.1 V</p>
      <p
        className={`mt-1.5 flex items-center justify-center gap-1.5 text-sm font-medium ${
          flagged ? 'text-amber-700' : 'text-ink/30'
        }`}
      >
        <Icon name={flagged ? 'alert' : 'clock'} size={15} />
        {flagged ? 'Outside tolerance' : 'Checking…'}
      </p>

      <div className="mt-4 border-t border-line pt-4">
        <div className="text-sm font-medium text-ink">Temperature (°C)</div>
        <div className="mt-2 rounded-card border border-emerald-300 bg-emerald-50 px-4 py-3 text-center font-mono text-lg tabular-nums">
          37.1
        </div>
        <p className="mt-2 text-xs text-muted">Target: 37.0 ± 0.5 °C</p>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700">
          <Icon name="check" size={15} />
          Within tolerance
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story mockup: Reagents (compact checklist — the theatrical version lives
// further down the page in <ReagentBand />)
// ---------------------------------------------------------------------------

function ReagentsScreenContent() {
  return (
    <div className="space-y-2 p-5">
      <h3 className="text-sm font-semibold text-ink">Pre-run checklist</h3>
      <div className="rounded-card border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <div className="flex items-center gap-1.5 font-medium">
          <Icon name="check" size={13} />
          SYBR Green Master Mix
        </div>
        <div className="mt-0.5 tabular-nums opacity-80">Lot 24C081 · Expires Nov 2026</div>
      </div>
      <div className="rounded-card border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
        <div className="flex items-center gap-1.5 font-medium">
          <Icon name="x" size={13} />
          Primary Antibody (1:1000)
        </div>
        <div className="mt-0.5 tabular-nums opacity-80">Lot 23A014 · Expired 4 months ago</div>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-card border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900">
        <Icon name="alert" size={14} />
        Expired reagent — acknowledgement required to proceed
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story mockup: Methods
// ---------------------------------------------------------------------------

const METHODS_SNIPPET =
  'Samples were incubated at 37.0 ± 0.5 °C for 5 ± 1 minutes with gentle agitation. Tris-HCl Buffer (1M, pH 8.0, lot 24A117) was used per protocol; all reagents were within expiry at time of use.';

function MethodsScreenContent() {
  const animate = useAmbientMotion();
  const [chars, setChars] = useState(METHODS_SNIPPET.length);

  useEffect(() => {
    if (!animate) return;
    let outer: ReturnType<typeof setTimeout>[] = [];
    let interval: ReturnType<typeof setInterval>;
    function cycle() {
      setChars(0);
      let i = 0;
      interval = setInterval(() => {
        i += 3;
        setChars(Math.min(i, METHODS_SNIPPET.length));
        if (i >= METHODS_SNIPPET.length) clearInterval(interval);
      }, 28);
      outer.push(setTimeout(cycle, 28 * Math.ceil(METHODS_SNIPPET.length / 3) + 3200));
    }
    cycle();
    return () => {
      outer.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [animate]);

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
        <Icon name="sparkles" size={13} />
        AI-generated draft
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink">
        {METHODS_SNIPPET.slice(0, chars)}
        {chars < METHODS_SNIPPET.length && <span className="records-cursor" aria-hidden />}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "From SOP to record" — pinned scroll story (the centrepiece)
// ---------------------------------------------------------------------------

const STORY_IDS = ['import', 'run', 'validate', 'reagents', 'methods'] as const;
type StoryId = (typeof STORY_IDS)[number];

interface StoryChapterData {
  id: StoryId;
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  path: string;
  dark?: boolean;
  render: () => ReactNode;
}

const STORY_CHAPTERS: StoryChapterData[] = [
  {
    id: 'import',
    icon: 'import',
    eyebrow: 'AI protocol import',
    title: 'A Word doc becomes a runnable protocol',
    body: 'Upload an SOP as a PDF or .docx, or paste it in as text. AI-assisted extraction reads it and builds every step, timer, tolerance and reagent — ready to run, without retyping a thing.',
    path: 'protocols/import',
    render: () => <ImportScreenContent />,
  },
  {
    id: 'run',
    icon: 'run',
    eyebrow: 'Execution',
    title: 'Follow the protocol at the bench, step by step',
    body: 'Timers, checkboxes, measurements and notes guide the run in real time, and anything that departs from the protocol is recorded as a deviation while you work — not reconstructed from memory afterwards.',
    path: 'runs/current/execute',
    dark: true,
    render: () => <RunScreenContent />,
  },
  {
    id: 'validate',
    icon: 'check',
    eyebrow: 'Measurements',
    title: 'Out-of-range measurements are flagged instantly',
    body: 'Every value is checked against its tolerance the moment you type it, so a result outside spec is caught at the bench, not weeks later during analysis.',
    path: 'runs/current/execute',
    render: () => <ValidateScreenContent />,
  },
  {
    id: 'reagents',
    icon: 'droplet',
    eyebrow: 'Reagent lots',
    title: 'Expired lots are caught before you start',
    body: 'Lot numbers and expiry dates live with the protocol that uses them. An expired reagent triggers a warning, and your decision to proceed is documented automatically.',
    path: 'protocols/pre-run-checklist',
    render: () => <ReagentsScreenContent />,
  },
  {
    id: 'methods',
    icon: 'file',
    eyebrow: 'AI-generated methods',
    title: 'A methods paragraph, drafted for you',
    body: 'Once the run is complete, AI drafts a methods-section paragraph from the real record — reagent lots, timings and measurements included — ready for you to review.',
    path: 'runs/current/methods',
    render: () => <MethodsScreenContent />,
  },
];

function StoryScroll() {
  const { active, setRef } = useActiveSection<StoryId>(STORY_IDS);
  const { ref: headingRef, inView: headingInView } = useReveal<HTMLDivElement>();
  const activeIndex = Math.max(0, STORY_IDS.indexOf(active));

  return (
    <section
      aria-labelledby="story-heading"
      className="border-y border-line bg-neutral-50/50 px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div
          ref={headingRef}
          className={`reveal ${headingInView ? 'is-in' : ''} mx-auto max-w-2xl text-center`}
        >
          <h2 id="story-heading" className="text-3xl leading-tight text-ink md:text-4xl">
            Protocols tell you what to do. Benchbook makes sure it gets done.
          </h2>
          <p className="mt-4 text-lg text-muted">
            One record runs from the protocol you start with, through every step
            you carry out, to the write-up at the end — measurements, timings,
            deviations and reagent lots captured as they happen.
          </p>
        </div>

        {/* Desktop: pinned device frame + progress rail. */}
        <div className="mt-16 hidden lg:grid lg:grid-cols-[3px_1fr_1fr] lg:gap-12">
          <div className="story-rail self-stretch" aria-hidden>
            <div
              className="story-rail-fill"
              style={{ height: `${(activeIndex / (STORY_IDS.length - 1)) * 100}%` }}
            />
          </div>
          <div className="space-y-40 pb-10">
            {STORY_CHAPTERS.map((c) => (
              <div key={c.id} ref={setRef(c.id)} className="flex min-h-[44vh] flex-col justify-center">
                <ChapterCopy chapter={c} active={active === c.id} />
              </div>
            ))}
          </div>
          <div className="story-frame-sticky h-fit self-start">
            <div className="relative">
              <div aria-hidden className="absolute -inset-8 -z-10 overflow-hidden rounded-[32px] opacity-40">
                <Photo
                  basePath="/landing/story-bench-top"
                  widths={[500, 1000]}
                  width={1000}
                  height={1500}
                  alt=""
                  sizes="420px"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-white/60" />
              </div>
              {STORY_CHAPTERS.map((c) => (
                <div key={c.id} className={`story-pane ${active === c.id ? 'is-active' : ''}`}>
                  <ScreenFrame path={c.path} contentClassName={c.dark ? 'bg-slate-900' : 'bg-white'}>
                    {active === c.id ? c.render() : null}
                  </ScreenFrame>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile/tablet: no sticky — each chapter shows its own mockup inline. */}
        <div className="mt-12 space-y-14 lg:hidden">
          {STORY_CHAPTERS.map((c) => (
            <MobileChapter key={c.id} chapter={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ChapterCopy({ chapter, active }: { chapter: StoryChapterData; active: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className={`hiw-step-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            active ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
          }`}
        >
          <Icon name={chapter.icon} size={20} />
        </span>
        <span className="text-xs font-semibold tracking-[0.16em] text-primary/70 uppercase">
          {chapter.eyebrow}
        </span>
      </div>
      <h3
        className={`hiw-step-text mt-4 text-2xl leading-tight md:text-[26px] ${
          active ? 'text-ink' : 'text-ink/55'
        }`}
      >
        {chapter.title}
      </h3>
      <p className="mt-3 text-base leading-relaxed text-muted">{chapter.body}</p>
    </div>
  );
}

function MobileChapter({ chapter }: { chapter: StoryChapterData }) {
  const { ref, inView } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${inView ? 'is-in' : ''}`}>
      <ChapterCopy chapter={chapter} active />
      <div className="mt-6">
        <ScreenFrame path={chapter.path} contentClassName={chapter.dark ? 'bg-slate-900' : 'bg-white'}>
          {chapter.render()}
        </ScreenFrame>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Built for the bench" — parallax photo band
// ---------------------------------------------------------------------------

const BENCH_FACTS: { icon: IconName; text: string }[] = [
  { icon: 'device', text: 'Works on tablets and phones propped up at the bench' },
  { icon: 'check', text: 'Installable as an app — no app store needed' },
  { icon: 'globe', text: 'Keeps working through brief connection drops' },
];

function BenchBand() {
  const { ref, inView } = useReveal<HTMLDivElement>();
  return (
    <section
      ref={ref}
      aria-labelledby="bench-heading"
      className="parallax-band relative isolate overflow-hidden"
    >
      <div className="absolute inset-0 -z-10">
        <Photo
          basePath="/landing/hero-bench"
          widths={[800, 1600]}
          width={1600}
          height={1067}
          alt="Researcher in a lab coat working at a laptop beside instrument benches"
          sizes="100vw"
          className="parallax-photo h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, rgba(23,19,42,0.78) 0%, rgba(99,102,241,0.55) 100%)',
          }}
        />
      </div>
      <div className="relative mx-auto max-w-5xl px-6 py-20 text-center text-white md:py-28">
        <h2 id="bench-heading" className="text-3xl leading-tight text-white md:text-4xl">
          Built for the bench, not just the desk
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-white/85">
          Benchbook is designed for gloved hands and shared lab devices — big
          touch targets, a fast interface, and a record that keeps up with you
          mid-experiment.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {BENCH_FACTS.map((f, i) => (
            <div
              key={f.text}
              className={`reveal ${inView ? 'is-in' : ''} rounded-card border border-white/15 bg-white/10 p-5 text-left backdrop-blur-sm`}
              style={{ '--reveal-i': i } as CSSProperties}
            >
              <Icon name={f.icon} size={22} />
              <p className="mt-3 text-sm leading-relaxed text-white/90">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reagent tracking over the shelves
// ---------------------------------------------------------------------------

function ReagentBand() {
  const { ref, inView } = useReveal<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [status, setStatus] = useState<'valid' | 'expired'>('expired');
  const [showWarning, setShowWarning] = useState(true);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!inView || reduced) return;
    setStatus('valid');
    setShowWarning(false);
    const t1 = setTimeout(() => {
      setStatus('expired');
      setShake(true);
    }, 900);
    const t2 = setTimeout(() => setShowWarning(true), 1500);
    const t3 = setTimeout(() => setShake(false), 1350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [inView, reduced]);

  return (
    <section
      ref={ref}
      aria-labelledby="reagents-heading"
      className="relative isolate overflow-hidden py-20 md:py-28"
    >
      <div className="absolute inset-0 -z-10">
        <Photo
          basePath="/landing/reagent-shelves"
          widths={[960, 1920]}
          width={1920}
          height={1280}
          alt="Shelves of labelled amber and white reagent bottles"
          sizes="100vw"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-white/80" />
      </div>
      <div className="relative mx-auto grid max-w-5xl items-center gap-12 px-6 lg:grid-cols-2">
        <div className={`reveal ${inView ? 'is-in' : ''}`}>
          <h2 id="reagents-heading" className="text-3xl leading-tight text-ink md:text-4xl">
            Every run records the lot that went into it
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Lot numbers and expiry dates live with the protocol that uses them,
            and are captured into the run as you work. Start an experiment with
            an expired reagent and Benchbook warns you first — your decision
            either way is recorded.
          </p>
        </div>
        <div
          className={`reveal ${inView ? 'is-in' : ''} bb-card mx-auto w-full max-w-sm p-5`}
          style={{ '--reveal-i': 1 } as CSSProperties}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">Tris-HCl Buffer, 1M pH 8.0</div>
              <div className="mt-1 text-xs tabular-nums text-muted">
                Lot 24A117 · Exp 12 Mar 2026
              </div>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                status === 'valid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              } ${shake ? 'bb-shake' : ''}`}
            >
              <Icon name={status === 'valid' ? 'check' : 'x'} size={13} />
              {status === 'valid' ? 'Valid' : 'Expired'}
            </span>
          </div>
          {showWarning && (
            <div className="bb-drop-in mt-4 flex items-center gap-2 rounded-card border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <Icon name="alert" size={16} />
              Expired reagent in checklist
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works — a line that draws itself
// ---------------------------------------------------------------------------

interface Step {
  icon: IconName;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: 'import',
    title: 'Import with AI, or write a protocol',
    body: 'Upload an existing SOP and AI builds the steps, timers, measurements and reagents list — or write one from scratch.',
  },
  {
    icon: 'run',
    title: 'Run it step by step',
    body: 'Work through the protocol at the bench with timers, tolerance checks and a pre-run reagent checklist guiding you.',
  },
  {
    icon: 'file',
    title: 'Get a complete, shareable record',
    body: 'Every run is saved as a full record — export it to PDF, send a read-only share link, or draft the methods section straight from it.',
  },
];

function HowItWorks() {
  const s0 = useReveal<HTMLLIElement>();
  const s1 = useReveal<HTMLLIElement>();
  const s2 = useReveal<HTMLLIElement>();
  const reveals = [s0, s1, s2];
  const litCount = reveals.filter((r) => r.inView).length;

  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="border-y border-line bg-neutral-50/60 px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="how-it-works-heading" className="text-3xl leading-tight text-ink md:text-4xl">
            How Benchbook works
          </h2>
        </div>

        <div className="relative mt-14 hidden items-center md:flex">
          {STEPS.map((_, i) => (
            <div key={i} className="flex flex-1 items-center last:flex-none">
              <span
                className={`hiw-step-icon flex h-3 w-3 shrink-0 rounded-full ${
                  reveals[i]?.inView ? 'bg-primary' : 'bg-line'
                }`}
                aria-hidden
              />
              {i < STEPS.length - 1 && (
                <span className="mx-2 h-[3px] flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                  <span
                    className="hiw-line-path block h-full origin-left bg-primary"
                    style={{ transform: reveals[i + 1]?.inView ? 'scaleX(1)' : 'scaleX(0)' }}
                  />
                </span>
              )}
            </div>
          ))}
        </div>

        <ol className="mt-6 grid grid-cols-1 gap-6 md:mt-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              ref={reveals[i]?.ref}
              className={`reveal ${reveals[i]?.inView ? 'is-in' : ''} bb-card p-6 md:p-7`}
              style={{ '--reveal-i': i } as CSSProperties}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`hiw-step-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                    reveals[i]?.inView ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                  }`}
                >
                  <Icon name={s.icon} size={20} />
                </span>
                <span className="font-display text-sm font-semibold tracking-[0.18em] text-primary/70">
                  {String(i + 1).padStart(2, '0')} / 03
                </span>
              </div>
              <h3
                className={`hiw-step-text mt-4 text-xl ${
                  reveals[i]?.inView ? 'text-ink' : 'text-ink/70'
                }`}
              >
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm">
          {litCount === STEPS.length && (
            <span className="text-primary">Import, run, record — that's the whole workflow.</span>
          )}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Complete records — methods draft types out, statistics grow, PDF tilts in
// ---------------------------------------------------------------------------

const RECORD_METHODS_TEXT =
  'Samples were incubated at 37.0 ± 0.5 °C for 5 ± 1 minutes. Tris-HCl Buffer (1M, pH 8.0, lot 24A117) was used according to protocol. All reagents were within expiry at time of use.';

const RECORD_BARS = [62, 88, 74, 95, 68];

function CompleteRecords() {
  const { ref, inView } = useReveal<HTMLDivElement>();
  const animate = useAmbientMotion();
  const [chars, setChars] = useState(RECORD_METHODS_TEXT.length);

  useEffect(() => {
    if (!inView || !animate) return;
    setChars(0);
    let i = 0;
    const id = setInterval(() => {
      i += 3;
      setChars(Math.min(i, RECORD_METHODS_TEXT.length));
      if (i >= RECORD_METHODS_TEXT.length) clearInterval(id);
    }, 26);
    return () => clearInterval(id);
  }, [inView, animate]);

  return (
    <section
      ref={ref}
      aria-labelledby="records-heading"
      className="records-dark relative isolate overflow-hidden px-6 py-20 md:py-28"
      style={{ background: 'radial-gradient(120% 90% at 20% 0%, #3a3490 0%, #221e58 45%, #17142f 100%)' }}
    >
      {/* Deep-indigo anchor section: the AI methods draft is the page's
          strongest AI moment, so it gets the contrast. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-10 -z-10 h-80 w-80 rounded-full bg-[#6366f1]/30 blur-3xl"
      />
      <div className="mx-auto max-w-5xl">
      <div className={`reveal ${inView ? 'is-in' : ''} mx-auto max-w-2xl text-center`}>
        <h2 id="records-heading" className="text-3xl leading-tight text-white md:text-4xl">
          Your lab's experimental memory
        </h2>
        <p className="mt-4 text-lg text-[#c9c8ea]">
          Every run becomes a structured record of what was actually done —
          steps, timings, measurements, deviations and the reagent lots used.
          Look back at a single run, or across every run of the same protocol
          to see how consistent your technique has been.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div
          className={`reveal ${inView ? 'is-in' : ''} rounded-card border border-white/10 bg-white/[0.06] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-sm`}
          style={{ '--reveal-i': 1 } as CSSProperties}
        >
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#b4b7ff] uppercase">
            <Icon name="sparkles" size={14} />
            AI-generated draft — review before publishing
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-white/90">
            {RECORD_METHODS_TEXT.slice(0, chars)}
            {chars < RECORD_METHODS_TEXT.length && <span className="records-cursor" aria-hidden />}
          </p>
        </div>

        <div className="space-y-6">
          <div
            className={`reveal ${inView ? 'is-in' : ''} rounded-card border border-white/10 bg-white/[0.06] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-sm`}
            style={{ '--reveal-i': 2 } as CSSProperties}
          >
            <h3 className="text-sm font-semibold text-white">Incubation temperature — 5 runs</h3>
            <div className="mt-4 flex h-28 items-end gap-3">
              {RECORD_BARS.map((b, i) => (
                <div key={i} className="h-full flex-1">
                  <div
                    className={`records-bar h-full rounded-t-md bg-[#8f93ff] ${inView ? 'is-in' : ''}`}
                    style={{ height: `${b}%`, '--bar-i': i } as CSSProperties}
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[#b9b8d9]">All 5 runs within ± 0.5 °C of target.</p>
          </div>

          <div
            className={`records-pdf ${inView ? 'is-in' : ''} flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.06] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-sm`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#c7c9ff]">
              <Icon name="file" size={20} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">
                Western_Blot_Run_2026-03-12.pdf
              </div>
              <div className="text-xs text-[#b9b8d9]">Full record · 8 steps · 3 reagents</div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export const HOME_FAQ: { question: string; answer: string }[] = [
  {
    question: 'What is an electronic lab notebook?',
    answer:
      'An electronic lab notebook (ELN) replaces the paper notebook for recording experiments: protocols, steps, measurements, timings and results are captured digitally as you work, rather than written up from memory afterwards. Benchbook goes a step further — it is an experiment execution platform, guiding you through the protocol at the bench and capturing what actually happened as it happens.',
  },
  {
    question: 'How does Benchbook help with reproducibility and methods sections?',
    answer:
      'Every experiment run is captured as a complete record — every step, timing, measurement, deviation and reagent lot used. From that record, AI can draft a methods-section paragraph for you to review and edit, and statistics across runs show how consistent your technique is over time.',
  },
  {
    question: 'What is the difference between a protocol and an experiment record?',
    answer:
      'A protocol is the plan: the steps you intend to follow. An experiment record is what actually happened when you ran it, including the real timings, the measured values, any deviation from the plan and the reagent lots you used. Benchbook turns the protocol into a guided run and produces that record automatically.',
  },
  {
    question: 'Is Benchbook free?',
    answer: 'Yes. Benchbook is free to use.',
  },
  {
    question: 'How does AI protocol import work?',
    answer:
      "Upload a Word document or paste in text from an existing SOP, and AI-assisted extraction reads it and builds a runnable protocol — identifying steps, timers, measurements and tolerances, plus the materials and reagents list — so you don't have to enter everything by hand.",
  },
  {
    question: 'Can I track reagent lot numbers and expiry dates?',
    answer:
      "Yes. Reagents and materials are grouped by the protocol that uses them, and you can record a lot number and expiry date for each one. Benchbook warns you before you start an experiment with a reagent that has expired, and keeps a list of entries that still need lot or expiry details.",
  },
  {
    question: 'Does Benchbook work on a tablet at the bench?',
    answer:
      "Yes. Benchbook is designed for tablets and phones at the bench, with large touch targets for gloved hands. It's installable as an app and keeps working through brief connection drops.",
  },
  {
    question: 'Can I share an experiment record with someone else?',
    answer:
      'Yes. You can export any run to PDF or generate a read-only share link, so a colleague, supervisor or reviewer can see the full record without needing a Benchbook account.',
  },
];

function FAQSection() {
  const { ref, inView } = useReveal<HTMLDivElement>();
  return (
    <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      <h2 id="faq-heading" className="text-center text-3xl leading-tight text-ink md:text-4xl">
        Frequently asked questions
      </h2>
      <div ref={ref} className="mt-10 space-y-3">
        {HOME_FAQ.map((item, i) => (
          <details
            key={item.question}
            className={`reveal ${inView ? 'is-in' : ''} bb-card group p-5 md:p-6`}
            style={{ '--reveal-i': i } as CSSProperties}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink marker:content-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
              {item.question}
              <Icon
                name="chevron-down"
                size={18}
                className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <p className="faq-answer text-sm leading-relaxed text-muted">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA + footer
// ---------------------------------------------------------------------------

function FinalCTA() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="relative isolate overflow-hidden px-6 py-16 text-center md:py-20"
    >
      <div className="absolute inset-0 -z-10">
        <Photo
          basePath="/landing/sample-tubes"
          widths={[960, 1920]}
          width={1920}
          height={1280}
          alt="Rows of purple, teal and beige-capped sample tubes in a rack"
          sizes="100vw"
          className="drift-photo h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            // Deep-indigo anchor: the tubes glow through faintly behind the CTA.
            background: 'linear-gradient(160deg, rgba(23,20,47,0.9) 0%, rgba(58,52,144,0.84) 100%)',
          }}
        />
      </div>
      <div className="relative mx-auto max-w-xl">
        <h2 id="final-cta-heading" className="text-3xl leading-tight text-white md:text-4xl">
          Make every experiment reproducible
        </h2>
        <p className="mt-3 text-base text-[#d4d3f0] md:text-lg">
          Free to use. Turn your first protocol into a guided experiment in
          minutes.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to="/login"
            className="group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-card bg-white px-6 text-base font-semibold text-[#221e58] shadow-sm transition-colors duration-150 hover:bg-[#eef0ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a2570]"
          >
            Get started free
            <Icon
              name="arrow-right"
              size={18}
              className="transition-transform duration-150 ease-out group-hover:translate-x-1"
            />
          </Link>
          <Link
            to="/why-benchbook"
            className="group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-card border border-white/30 px-6 text-base font-medium text-white transition-colors duration-150 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a2570]"
          >
            See how it works
            <Icon
              name="arrow-right"
              size={18}
              className="transition-transform duration-150 ease-out group-hover:translate-x-1"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS = [
  { to: '/why-benchbook', label: 'Why Benchbook' },
  { to: '/about', label: 'About' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/login', label: 'Sign in' },
];

function Footer() {
  return (
    <footer className="mx-auto max-w-5xl px-6 py-12 text-center text-xs text-muted">
      <div className="border-t border-line pt-6">© Benchbook</div>
      <nav aria-label="Footer" className="mt-3">
        <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
          {FOOTER_LINKS.map((l, i) => (
            <li key={l.to} className="flex items-center gap-2">
              <Link to={l.to} className="hover:text-ink hover:underline">
                {l.label}
              </Link>
              {i < FOOTER_LINKS.length - 1 && <span aria-hidden>·</span>}
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-3 text-[11px] text-muted/70">Photos: Unsplash</p>
    </footer>
  );
}
