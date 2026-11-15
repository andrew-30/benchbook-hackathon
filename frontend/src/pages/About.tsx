import { Link } from 'react-router-dom';
import { PageTransition } from '../components/PageTransition';
import { usePageTitle } from '../hooks/usePageTitle';
import { Icon, type IconName } from '../components/Icon';
import { LEGAL_ENTITY } from '../legal/entity';

/**
 * Public About / founder-story page. Rendered outside RequireAuth so visitors
 * (and anonymous viewers of shared runs) can read it without an account.
 * Standalone layout — no AppLayout chrome. Modern Confident skin, matching
 * /login and /why-benchbook.
 *
 * The narrative opens with a specific biology hook to establish the founder's
 * credibility, then deliberately bridges to the universal problem so a chemist
 * / physicist / clinician feels equally addressed by the time they reach the
 * CTA.
 */
export function About() {
  usePageTitle('Our Story');
  return (
    <PageTransition>
      <div className="min-h-screen bg-canvas">
        <Hero />

        <article
          className="mx-auto max-w-2xl space-y-12 px-6 py-14 md:py-20 text-ink/80"
          style={{ fontSize: '17px', lineHeight: 1.8 }}
        >
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <Icon name="beaker" size={18} />
            </span>
            <span className="text-base font-semibold tracking-tight text-ink">Benchbook</span>
          </Link>

          <FounderStory />
          <UniversalPain />
          <Solution />
          <Quote />
          <CTA />
        </article>

        <Footer />
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <header
      className="relative overflow-hidden px-6 py-20 text-center md:py-28"
      style={{ background: 'linear-gradient(160deg, #ecedff 0%, #f5f5ff 48%, #ffffff 100%)' }}
    >
      {/* Soft indigo glow — decorative, premium, calm. Matches /login. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl md:left-auto md:right-0 md:translate-x-1/4"
      />
      <div className="relative mx-auto max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Our story
        </span>
        <h1 className="mt-5 text-4xl leading-[1.1] text-ink md:text-5xl">
          Built at the bench,
          <br />
          for the bench.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
          By a researcher who lived the problem.
        </p>
      </div>
    </header>
  );
}

function FounderStory() {
  return (
    <section className="space-y-5">
      <p>
        I spent months in a research lab isolating bone marrow from mice, running
        ELISA plates for cytokine quantification, and analysing gene expression
        with RT-qPCR for my thesis on immune responses in Acute Respiratory
        Distress Syndrome.
      </p>
      <p>
        And like every researcher before me, I told myself I would write it up
        later.
      </p>

      {/* Bridging insight — pulls the reader from the personal story to the
          published evidence that this is an industry-wide pattern, not just
          one researcher's bad week. Soft indigo wash + left border reads as a
          "key insight" callout, echoed by the closing quote's border treatment. */}
      <aside className="space-y-3 rounded-card border-l-4 border-primary bg-primary/5 px-6 py-5 text-lg italic leading-relaxed text-ink/90 md:px-8">
        <p>This is not just my experience.</p>
        <p>
          In 2016 Nature published a landmark study: more than 70% of researchers
          had failed to reproduce another scientist's experiments. More than 50%
          had failed to reproduce their own. $28 billion is spent annually on
          preclinical research that cannot be reproduced in the USA alone.
        </p>
        <p>
          The root cause is not bad science. It is poor real-time documentation
          at the bench.
        </p>
        <p>Benchbook was built to fix that.</p>
      </aside>

      <h2 className="pt-6 text-2xl text-ink">
        But "later" sounds the same in every lab.
      </h2>

      <p>
        Whether you are pipetting at 2am in a cell biology lab, running
        chromatography in an organic chemistry lab, calibrating sensors in a
        physics lab, or analysing food samples in a quality control laboratory —
        the problem is identical.
      </p>
      <p>
        You finish the experiment exhausted. You make a mental note. Three weeks
        later you are staring at your results trying to reconstruct exactly what
        you did.
      </p>
    </section>
  );
}

const PAIN_POINTS = [
  'A chemist who cannot remember which batch of catalyst they used.',
  'A physicist whose device parameters were never properly recorded.',
  'A food scientist whose texture measurements cannot be reproduced.',
  'A clinical researcher whose assay conditions were only partially noted.',
];

function UniversalPain() {
  return (
    <section className="bb-card p-6 md:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name="chart" size={20} />
        </span>
        <h2 className="text-2xl text-ink">This is not a biology problem.</h2>
      </div>
      <p className="mt-4">The reproducibility crisis affects every field of science:</p>
      <ul className="mt-4 space-y-3">
        {PAIN_POINTS.map((p) => (
          <li key={p} className="flex gap-3">
            <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4">
        The data is lost not because researchers are careless — but because no
        tool made it easy to record everything as you work.
      </p>
    </section>
  );
}

interface FieldCard {
  icon: IconName;
  title: string;
  examples: string;
}

const FIELDS: FieldCard[] = [
  {
    icon: 'flask',
    title: 'Biology & Biotech',
    examples: 'ELISA, PCR, cell culture, protein assays',
  },
  {
    icon: 'beaker',
    title: 'Chemistry',
    examples: 'Synthesis, chromatography, spectroscopy',
  },
  {
    icon: 'atom',
    title: 'Physics',
    examples: 'Device characterisation, optical measurements',
  },
  {
    icon: 'pulse',
    title: 'Clinical Research',
    examples: 'Immunoassays, diagnostic protocols',
  },
  {
    icon: 'leaf',
    title: 'Food Science',
    examples: 'Quality control, sensory analysis',
  },
  {
    icon: 'globe',
    title: 'Environmental Science',
    examples: 'Field sampling, water analysis',
  },
];

function Solution() {
  return (
    <section className="space-y-5">
      <h2 className="text-2xl text-ink">So I built the tool I wished I had.</h2>
      <p>
        Benchbook records every step of every experiment as you work —
        measurements, lot numbers, deviations, timestamps — and then writes your
        methods section automatically in 12 seconds.
      </p>
      <p>It works for any experiment in any field:</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {FIELDS.map((f) => (
          <div key={f.title} className="bb-card p-4 md:p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name={f.icon} size={16} />
            </span>
            <div className="mt-3 text-sm font-semibold text-ink md:text-base">
              {f.title}
            </div>
            <div className="mt-1 text-xs leading-snug text-muted md:text-sm">
              {f.examples}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Quote() {
  return (
    <section className="border-l-4 border-primary/30 py-2 pl-6 md:pl-8">
      <blockquote className="font-display text-xl italic leading-snug text-ink md:text-2xl">
        "Because 'I'll write it up later' has cost too many experiments — in too
        many labs — in too many fields — around the world."
      </blockquote>
      <footer className="mt-5 text-sm not-italic text-muted">
        — Andrew Kisitu
        <br />
        <span>Founder, Benchbook</span>
        <br />
        <span>Researcher, BioMedical Sciences</span>
      </footer>
    </section>
  );
}

function CTA() {
  return (
    <section className="pt-4 text-center">
      <h2 className="text-2xl text-ink">Start recording your experiments</h2>
      <p className="mt-2 text-muted">Free to start. No credit card needed.</p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Link to="/login" className="bb-btn-primary min-h-[52px] px-6 text-base">
          Get started free
          <Icon name="arrow-right" size={18} />
        </Link>
        <Link to="/" className="bb-btn-ghost min-h-[52px] px-6 text-base">
          <Icon name="arrow-right" size={18} className="rotate-180" />
          Back to Benchbook
        </Link>
      </div>
      <p className="mt-5 flex items-center justify-center gap-4 text-sm">
        <Link
          to="/why-benchbook"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Why Benchbook
          <Icon name="arrow-right" size={14} />
        </Link>
      </p>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-2xl px-6 pb-12 text-center text-xs text-muted">
      <div className="border-t border-line pt-6">
        © 2026 {LEGAL_ENTITY} · benchbook.app
      </div>
      <div className="mt-2 space-x-2">
        <Link to="/why-benchbook" className="hover:text-ink hover:underline">
          Why Benchbook
        </Link>
        <span>·</span>
        <Link to="/privacy" className="hover:text-ink hover:underline">
          Privacy
        </Link>
        <span>·</span>
        <Link to="/terms" className="hover:text-ink hover:underline">
          Terms
        </Link>
      </div>
    </footer>
  );
}
