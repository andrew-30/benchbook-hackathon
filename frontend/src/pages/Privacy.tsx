import { usePageTitle } from '../hooks/usePageTitle';
import { LegalPage, Section, MailLink } from '../legal/LegalPage';
import {
  LEGAL_ENTITY,
  LEGAL_COUNTRY,
  LEGAL_EMAIL,
  LEGAL_POSTAL_ADDRESS,
  SHARE_LINK_EXPIRY_DAYS,
} from '../legal/entity';

/**
 * Public-facing privacy policy.
 *
 * Copy rule (see seo/site.ts): describe processors by category — "an AI
 * provider", "our hosting provider" — never by vendor or model name.
 *
 * Accuracy notes for whoever edits this next. Every claim below is meant to
 * track the actual system; if you change the system, change this page:
 *   - AI features send document text and run data off-box (routes/import.ts,
 *     routes/runs.ts generate-methods). The old policy claimed we never share
 *     data with third parties, which was false.
 *   - Share links are served by the admin client and bypass RLS
 *     (routes/shared.ts); they expire per migration 005.
 *   - The client persists a slice of the query cache to localStorage for 24h
 *     and clears it on sign-out (App.tsx).
 *   - Error monitoring only runs when NODE_ENV=production and SENTRY_DSN is
 *     set (backend/src/instrument.ts).
 */
export function Privacy() {
  usePageTitle('Privacy Policy');
  return (
    <LegalPage
      title="Privacy Policy"
      summary="What Benchbook collects, what leaves the app and when, who processes it, and how to get it back or delete it."
      otherDoc={{ to: '/terms', label: 'Terms of Service' }}
    >
      <Section title="1. Who we are">
        <p>
          Benchbook is operated by {LEGAL_ENTITY}
          {LEGAL_COUNTRY ? ` (${LEGAL_COUNTRY})` : ''}, the data controller for
          the information described here. You can reach us at{' '}
          <MailLink email={LEGAL_EMAIL} />.
        </p>
      </Section>

      <Section title="2. What we collect">
        <p>We collect only what the service needs to work.</p>
        <ul>
          <li>
            <strong>Account details</strong> — your email address, name,
            institution and research area.
          </li>
          <li>
            <strong>Research content</strong> — the protocols you create or
            import, including any document you upload; the experiments you run;
            and the measurements, timings, notes and deviations recorded during
            them.
          </li>
          <li>
            <strong>Reagent records</strong> — the reagents in your inventory,
            including manufacturer, catalogue number, lot number and expiry
            date.
          </li>
          <li>
            <strong>Feedback</strong> — anything you send us through the
            in-app feedback form, along with your browser user-agent string.
          </li>
          <li>
            <strong>Technical data</strong> — in production we record errors
            and a sample of performance traces so we can diagnose faults, and we
            log the volume of AI requests per account to enforce fair-use
            limits.
          </li>
        </ul>
        <p>
          We do not ask for and do not want patient data, personal data about
          human research subjects, or any special-category personal data. Please
          do not enter it into Benchbook.
        </p>
      </Section>

      <Section title="3. Why we use it, and our legal basis">
        <ul>
          <li>
            <strong>To provide the service</strong> — storing your protocols and
            experiments, running the features you ask for, and signing you in.
            Legal basis: performance of our contract with you.
          </li>
          <li>
            <strong>To keep the service working and secure</strong> — error
            monitoring, rate limiting and abuse prevention. Legal basis: our
            legitimate interest in a reliable, secure service.
          </li>
          <li>
            <strong>To reply to you</strong> — answering feedback and support
            messages. Legal basis: our legitimate interest in supporting users.
          </li>
        </ul>
        <p>
          We do not sell your data, we do not share it for advertising, and we
          do not use your research content to train AI models.
        </p>
      </Section>

      <Section title="4. AI features and what they send">
        <p>
          Some Benchbook features are AI-assisted. When you use them, the
          relevant content is sent to a third-party AI provider to be processed
          and returned:
        </p>
        <ul>
          <li>
            <strong>Importing a protocol</strong> — the text of the document you
            upload is sent to the AI provider so it can be turned into
            structured, runnable steps.
          </li>
          <li>
            <strong>Drafting a methods section</strong> — the details of the
            completed experiment are sent: the steps, recorded measurements and
            summary statistics, timings, deviations, reagent names and lot
            numbers, and the operator name and date.
          </li>
        </ul>
        <p>
          These features are optional. If you never use them, none of your
          research content is sent to the AI provider. Using them requires a
          verified email address. We keep a short-lived cache of extraction
          results so that re-importing the same document does not need a second
          call, and we record the size and cost of each request — but not its
          content — so we can enforce fair-use limits.
        </p>
      </Section>

      <Section title="5. Who else processes your data">
        <p>
          We use a small number of service providers to run Benchbook. They
          process data only on our instructions and only to provide their
          service to us:
        </p>
        <ul>
          <li>A database and authentication provider, which stores your account and research data.</li>
          <li>A hosting provider, which runs the website and the API.</li>
          <li>An AI provider, as described in section 4.</li>
          <li>An error-monitoring provider, which receives diagnostic data when something fails in production.</li>
          <li>An email provider, which delivers sign-in emails and forwards your feedback to us.</li>
        </ul>
        <p>
          We will also disclose data if we are legally required to, or where it
          is necessary to protect our rights or the safety of others.
        </p>
      </Section>

      <Section title="6. Where your data is stored">
        <p>
          Your account and research data are stored on servers located in the
          European Economic Area.
        </p>
        {LEGAL_COUNTRY ? (
          <p>
            {LEGAL_ENTITY} is established in the {LEGAL_COUNTRY}, so your data
            is accessible to us from outside the European Economic Area.
          </p>
        ) : null}
        <p>
          Some of the providers in section 5 also process data outside the
          European Economic Area. Where that happens we rely on the providers'
          standard contractual clauses or an equivalent transfer mechanism to
          protect your data.
        </p>
      </Section>

      <Section title="7. Links you share">
        <p>
          If you create a share link for an experiment, that link is public:
          anyone who has it can view the shared experiment without signing in,
          and it may be forwarded on to people you did not intend. Only the
          experiment you shared is exposed — not your account, your other
          experiments or your reagent inventory.
        </p>
        <p>
          Share links stop working automatically {SHARE_LINK_EXPIRY_DAYS} days
          after they are created. You can revoke one before then from the
          experiment it belongs to. Treat a share link like a password, and do
          not create one for anything you would not want seen by a stranger.
        </p>
      </Section>

      <Section title="8. Data kept on your device">
        <p>
          Benchbook can be installed as an app and works partly offline. To do
          that, your browser stores your sign-in session and a copy of recently
          viewed data — including an experiment in progress — for up to 24
          hours. This stays on your device. It is cleared when you sign out, so
          sign out before handing over a shared bench computer.
        </p>
      </Section>

      <Section title="9. Cookies and tracking">
        <p>
          We use only what is required to keep you signed in and to run the
          service. We do not use advertising cookies, third-party trackers or
          website analytics, and there is no cross-site tracking of any kind.
        </p>
      </Section>

      <Section title="10. How long we keep it">
        <p>
          We keep your account and research data for as long as your account
          exists. If you delete your account, your profile, protocols,
          experiments and reagent records are deleted immediately and are not
          recoverable — so export anything you want to keep first.
        </p>
        <p>
          Share links expire after {SHARE_LINK_EXPIRY_DAYS} days. Diagnostic
          error data and fair-use request logs are kept for a limited period for
          security and reliability purposes, and contain no research content.
        </p>
      </Section>

      <Section title="11. Your rights">
        <p>
          Depending on where you live, you have the right to access your data,
          correct it, delete it, export it in a portable format, object to or
          restrict certain processing, and withdraw consent where we rely on it.
        </p>
        <p>
          You can do most of this yourself and immediately: edit your profile in
          Settings, export experiments and protocols as PDF, CSV or spreadsheet
          files from within the app, and delete your account from Settings. For
          anything else, email <MailLink email={LEGAL_EMAIL} /> and we will
          respond within 30 days.
        </p>
        <p>
          If you are in the EEA or the UK and you think we have handled your
          data badly, you can complain to your national data protection
          authority. We would rather you told us first so we can put it right.
        </p>
      </Section>

      <Section title="12. Security">
        <p>
          Access to your data is enforced at the database level, so one
          account cannot read another's records. Traffic is encrypted in
          transit, uploads are restricted by type and size, and requests are
          rate limited. No system is perfectly secure, and we do not claim
          otherwise — but Benchbook should not be your only copy of a result
          that matters. Keep your own records too.
        </p>
      </Section>

      <Section title="13. Changes to this policy">
        <p>
          If we change this policy in a way that materially affects you, we will
          update the date at the top of this page and tell you by email or in
          the app before the change takes effect.
        </p>
      </Section>

      <Section title="14. Contact">
        <p>
          <MailLink email={LEGAL_EMAIL} />
          <br />
          {LEGAL_ENTITY}
          {LEGAL_POSTAL_ADDRESS ? (
            <>
              <br />
              {LEGAL_POSTAL_ADDRESS}
            </>
          ) : null}
        </p>
      </Section>
    </LegalPage>
  );
}
