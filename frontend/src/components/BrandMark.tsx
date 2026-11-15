import { Icon } from './Icon';

/** Benchbook logo lockup — indigo beaker chip + wordmark. Used on the
 *  sign-in, onboarding and public shared-experiment pages so the brand
 *  looks identical everywhere a visitor first meets it. */
export function BrandMark() {
  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
        <Icon name="beaker" size={22} />
      </span>
      <span className="text-lg font-semibold tracking-tight text-ink">Benchbook</span>
    </div>
  );
}
