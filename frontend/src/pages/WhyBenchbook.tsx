import { Link } from 'react-router-dom';
import { PageTransition } from '../components/PageTransition';
import { usePageTitle } from '../hooks/usePageTitle';
import { Icon, type IconName } from '../components/Icon';
import { LEGAL_ENTITY } from '../legal/entity';

/**
 * Public "Why Benchbook" page. Category positioning rather than competitor
 * naming — speaks to the gap between general note-taking tools and
 * enterprise ELNs by describing the problems each leaves unsolved for
 * researchers at the bench. Modern Confident skin, matching /login.
 */
export function WhyBenchbook() {
  usePageTitle('Why Benchbook exists');
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

          <CrisisSection />
          <GeneralToolsSection />
          <EnterpriseSection />
          <FeaturesSection />
          <OneLineSummary />
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
          Built for the bench. Not the desk.
        </span>
        <h1 className="mt-5 text-4xl leading-[1.1] text-ink md:text-5xl">
          Why Benchbook exists
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
          Most tools record what you remember. Benchbook records what actually
          happened.
        </p>
      </div>
    </header>
  );
}

function CrisisSection() {
  // Stats sourced from Baker, M. (2016) "1,500 scientists lift the lid on
  // reproducibility", Nature 533, 452-454 (DOI: 10.1038/533452a). The
  // $28B/year figure traces to Freeman et al. (2015) "The Economics of
  // Reproducibility in Preclinical Research", PLOS Biology — cited
  // throughout the Baker piece — but the user-facing source line points to
  // the Baker survey as the canonical reference.
  const stats = [
    {
      number: '70%',
      text: "of researchers have failed to reproduce another scientist's experiments",
    },
    { number: '50%', text: 'have failed to reproduce their own experiments' },
    {
      number: '$28B',
      text: 'spent annually on preclinical research that cannot be reproduced — USA alone',
    },
  ];
  return (
    <section className="bb-card overflow-hidden">
      <div
        className="relative px-6 py-10 md:px-10 md:py-12"
        style={{ background: 'linear-gradient(160deg, #ecedff 0%, #f5f5ff 55%, #ffffff 100%)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 right-0 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              The crisis
            </span>
          </div>
          <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-3">
            {stats.map((s) => (
              <div
                key={s.number}
                className="rounded-2xl border border-line bg-white/80 p-5 text-center"
              >
                <div className="font-display text-4xl leading-none text-primary tabular-nums md:text-5xl">
                  {s.number}
                </div>
                <p className="mt-3 text-sm leading-snug text-ink/70">{s.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted">Source: Baker, Nature (2016)</p>
          <p className="mt-6 text-center text-lg leading-snug text-ink md:text-xl">
            This is not a talent problem. It is a documentation problem.
            <br />
            Benchbook was built to solve it.
          </p>
        </div>
      </div>
    </section>
  );
}

function GeneralToolsSection() {
  return (
    <section className="bb-card p-6 md:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name="file" size={20} />
        </span>
        <h2 className="text-2xl text-ink">The problem with general tools</h2>
      </div>
      <p className="mt-4 text-ink/80">
        Notes apps and word processors are powerful general tools. But they were
        never designed for one specific moment: standing at the lab bench with
        gloved hands, trying to record an experiment accurately in real time.
      </p>
      <p className="mt-3 text-ink/80">
        Benchbook was designed for exactly that moment. Nothing else.
      </p>
    </section>
  );
}

function EnterpriseSection() {
  return (
    <section className="bb-card p-6 md:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name="gear" size={20} />
        </span>
        <h2 className="text-2xl text-ink">The problem with enterprise ELNs</h2>
      </div>
      <p className="mt-4 text-ink/80">
        Professional lab software solves compliance problems. But it creates new
        ones: complexity, cost, and tools that feel built for IT departments
        not researchers.
      </p>
      <p className="mt-3 text-ink/80">
        Benchbook was built for the researcher at the bench. Not the manager
        signing the contract.
      </p>
    </section>
  );
}

interface Feature {
  icon: IconName;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: 'check',
    title: 'Real-time validation',
    body: 'Measurements validated against spec limits as you record them. Green, amber, or red — instantly.',
  },
  {
    icon: 'droplet',
    title: 'Reagent lot tracking',
    body: 'Every lot number and expiry date captured automatically. Expiry warnings before you start.',
  },
  {
    icon: 'file',
    title: 'Methods in 12 seconds',
    body: 'Complete your experiment. Click one button. Publication-ready methods section.',
  },
  {
    icon: 'chart',
    title: 'Plain language stats',
    body: 'Reproducibility score, trend analysis, and actionable tips — in language that makes sense.',
  },
  {
    icon: 'device',
    title: 'Bench-native design',
    body: 'Built for gloved hands, tablets, and lab benches. Not office desks.',
  },
  {
    icon: 'clock',
    title: 'Hours saved per experiment',
    body: 'Stop writing methods from memory. Stop reconstructing what you did three weeks later. Record once. Use forever.',
  },
];

function FeaturesSection() {
  return (
    <section className="space-y-5">
      <h2 className="text-2xl text-ink">Five things Benchbook does</h2>
      <p className="text-muted">
        Six, actually — each one solving a real problem at the bench.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="bb-card p-4 md:p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name={f.icon} size={16} />
            </span>
            <div className="mt-3 text-sm font-semibold text-ink md:text-base">
              {f.title}
            </div>
            <div className="mt-1 text-xs leading-snug text-muted md:text-sm">
              {f.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OneLineSummary() {
  return (
    <section className="border-l-4 border-primary/30 py-2 pl-6 md:pl-8">
      <blockquote className="font-display text-xl italic leading-snug text-ink md:text-2xl">
        "Stop reconstructing experiments from memory. Record them live."
      </blockquote>
    </section>
  );
}

function CTA() {
  return (
    <section className="pt-4 text-center">
      <Link to="/login" className="bb-btn-primary min-h-[52px] px-6 text-base">
        Get Started Free
        <Icon name="arrow-right" size={18} />
      </Link>
      <p className="mt-3 text-sm text-muted">
        No credit card. Import your first protocol in 30 seconds.
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
        <Link to="/about" className="hover:text-ink hover:underline">
          Our Story
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
