import { usePageTitle } from '../hooks/usePageTitle';
import { LegalPage, Section, MailLink } from '../legal/LegalPage';
import {
  LEGAL_ENTITY,
  LEGAL_EMAIL,
  LEGAL_JURISDICTION,
  LEGAL_LIABILITY_CAP_USD,
  SHARE_LINK_EXPIRY_DAYS,
} from '../legal/entity';

/**
 * Public terms of service. Mirrors the Privacy page layout via LegalPage.
 *
 * Copy rule (see seo/site.ts): AI features are described as "AI-assisted" —
 * never name the model or the vendor.
 *
 * The clauses that exist for a specific reason, so nobody trims them as
 * boilerplate:
 *   - Section 5 (AI drafts): the methods generator produces text intended for
 *     publication. Users must verify it; we must not warrant it.
 *   - Section 7 (regulated use): Benchbook is not validated for GxP, clinical
 *     or 21 CFR Part 11 workflows and must not be presented as if it were.
 *   - Section 8 (keep your own records): there is no user-facing backup or
 *     undelete. Account deletion is immediate and irreversible.
 *   - Section 10 (limits): rate limits, a rolling daily AI quota and a global
 *     AI kill-switch are all real and enforced server-side.
 *   - The old "99% uptime" line was an SLA promise on a free product, and
 *     contradicted the sentence right after it. It is gone.
 */
export function Terms() {
  usePageTitle('Terms of Service');
  return (
    <LegalPage
      title="Terms of Service"
      summary="The agreement between you and Benchbook: what you can expect from the service, what we expect from you, and where our responsibility ends."
      otherDoc={{ to: '/privacy', label: 'Privacy Policy' }}
    >
      <Section title="1. These terms">
        <p>
          Benchbook is an experiment execution platform provided by{' '}
          {LEGAL_ENTITY}. By creating an account or using the service you agree
          to these terms. If
          you do not agree with them, please do not use Benchbook.
        </p>
      </Section>

      <Section title="2. Who can use Benchbook">
        <p>
          You must be at least 16 years old. If you are using Benchbook as part
          of your work or studies, you are confirming that you are allowed to do
          so under your institution's own policies — some institutions require
          research records to be held in a specific system, and that is your
          responsibility to check, not ours.
        </p>
      </Section>

      <Section title="3. Your account">
        <p>
          Keep your credentials secure and do not share your account with
          others. You are responsible for what happens under your account. Tell
          us at <MailLink email={LEGAL_EMAIL} /> if you think it has been
          compromised. Some features require a verified email address.
        </p>
      </Section>

      <Section title="4. Your data stays yours">
        <p>
          You own your protocols, experiments and results. We do not claim any
          ownership of them, and we do not use your research content to train AI
          models.
        </p>
        <p>
          You give us only the permission we need to run the service for you:
          to store, process and display your content back to you, to send it to
          our service providers where a feature requires it — including the AI
          provider when you choose to use an AI-assisted feature — and to show
          an experiment to anyone holding a share link you created. This
          permission ends when you delete the content or your account.
        </p>
      </Section>

      <Section title="5. AI-assisted features produce drafts">
        <p>
          Benchbook can convert an uploaded protocol document into structured
          steps, and can draft a methods section from a completed experiment.
          Both are AI-assisted, and both can be wrong. They may misread a
          document, omit a step, or state a number or a detail incorrectly.
        </p>
        <p>
          <strong>
            You must check every AI-generated output against your source
            material before you rely on it, run an experiment from it, or
            publish it.
          </strong>{' '}
          An imported protocol is a starting point to review and correct, not a
          validated procedure. A generated methods section is a draft for you to
          verify and edit — you remain its author and you remain responsible for
          the accuracy and integrity of anything you publish. We give no
          warranty that AI output is accurate, complete or fit for your purpose.
        </p>
      </Section>

      <Section title="6. Acceptable use">
        <ul>
          <li>Use Benchbook for legitimate research purposes.</li>
          <li>Do not upload content you have no right to use, or that is unlawful.</li>
          <li>Do not attempt to breach the security of the service, access another user's data, or probe, scan or overload our systems.</li>
          <li>Do not use automated means to extract data from the service, or resell access to it.</li>
          <li>
            Do not use the AI features to generate fabricated results, or to
            produce anything designed to mislead about what was actually done at
            the bench.
          </li>
        </ul>
      </Section>

      <Section title="7. Not for regulated, clinical or personal data">
        <p>
          Benchbook is a research tool. It has not been validated for regulated
          use, and it is not a medical device.
        </p>
        <p>
          Do not use Benchbook as a system of record for GxP, GLP or GMP work,
          for clinical trial records, for diagnostic decisions, or for any
          workflow requiring compliance with 21 CFR Part 11 or an equivalent
          regime. Do not enter patient data, personal data about human research
          subjects, or any other special-category personal data. If you do so
          anyway, that is your decision and your responsibility.
        </p>
      </Section>

      <Section title="8. Keep your own records">
        <p>
          Benchbook should not be your only copy of anything that matters. There
          is no undelete: if you delete an experiment, a protocol or your
          account, it is gone immediately and permanently, and we cannot restore
          it for you. Export your work regularly — PDF, CSV and spreadsheet
          exports are built in — and keep those copies somewhere you control.
        </p>
      </Section>

      <Section title="9. Availability and changes to the service">
        <p>
          Benchbook is provided as-is and as-available. We work to keep it
          running, but we do not offer a service level agreement and we do not
          guarantee uninterrupted or error-free operation. Maintenance, faults
          and provider outages will happen.
        </p>
        <p>
          We may add, change or remove features. If we plan to discontinue the
          service or remove something you depend on, we will give you
          reasonable notice and time to export your data.
        </p>
      </Section>

      <Section title="10. Fair use and limits">
        <p>
          To keep the service available to everyone and its costs sustainable,
          we apply limits — including limits on how often requests can be made,
          a daily allowance for AI-assisted features, and caps on upload size
          and file type. We may adjust these limits, and we may temporarily
          disable AI features entirely if we need to. Share links expire
          automatically after {SHARE_LINK_EXPIRY_DAYS} days.
        </p>
      </Section>

      <Section title="11. Price">
        <p>
          Benchbook is currently free to use, with all features available to
          every account. We may introduce paid plans in the future. If we do, we
          will tell you before any charge applies, and you will never be charged
          without agreeing to it first.
        </p>
      </Section>

      <Section title="12. Our intellectual property">
        <p>
          The Benchbook software, design, branding and documentation belong to{' '}
          {LEGAL_ENTITY}. These terms give you permission to use the service —
          they do not transfer any ownership in it to you.
        </p>
      </Section>

      <Section title="13. No warranties">
        <p>
          To the fullest extent permitted by law, Benchbook is provided without
          warranties of any kind, whether express or implied, including any
          implied warranties of merchantability, fitness for a particular
          purpose, accuracy, or non-infringement. We do not warrant that the
          service will meet your requirements, that it will be uninterrupted or
          error-free, or that any output it produces — AI-assisted or otherwise
          — is accurate or suitable for publication.
        </p>
      </Section>

      <Section title="14. Limitation of liability">
        <p>
          To the fullest extent permitted by law, {LEGAL_ENTITY} will not be
          liable for any indirect, incidental, special or consequential loss, or
          for loss of data, loss of research, lost time, lost funding, delayed,
          retracted or rejected publication, or any other economic loss arising
          from your use of Benchbook.
        </p>
        <p>
          Our total aggregate liability to you for all claims connected with
          Benchbook is limited to the greater of the amount you have paid us in
          the twelve months before the claim, or US${LEGAL_LIABILITY_CAP_USD}.
        </p>
        <p>
          Nothing in these terms excludes liability that cannot lawfully be
          excluded, including for death or personal injury caused by negligence,
          or for fraud. Some jurisdictions do not allow certain exclusions, so
          parts of this section may not apply to you.
        </p>
      </Section>

      <Section title="15. Termination">
        <p>
          You can stop using Benchbook and delete your account at any time from
          Settings. We may suspend or terminate an account that breaches these
          terms, or where we are required to by law; where it is reasonable to
          do so, we will warn you first and give you a chance to export your
          data. Sections 4, 5, 7, 8 and 12 to 14 survive termination.
        </p>
      </Section>

      <Section title="16. Changes to these terms">
        <p>
          We may update these terms. If a change materially affects your rights,
          we will update the date at the top of this page and notify you by
          email or in the app before it takes effect. Continuing to use
          Benchbook after that means you accept the updated terms.
        </p>
      </Section>

      <Section title="17. Governing law">
        <p>
          These terms are governed by the laws of {LEGAL_JURISDICTION}, where{' '}
          {LEGAL_ENTITY} is established, and the courts of that state have
          authority over any dispute. If you use Benchbook as a consumer
          elsewhere, you keep the protections of the mandatory law of the
          country you live in.
        </p>
      </Section>

      <Section title="18. Contact">
        <p>
          <MailLink email={LEGAL_EMAIL} />
        </p>
      </Section>
    </LegalPage>
  );
}
