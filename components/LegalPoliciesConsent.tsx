import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  PRICING_DOCUMENT_PATH,
  privacyDocumentHref,
  termsDocumentHref,
} from "@/lib/legal-policies";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  className?: string;
};

export function LegalPoliciesConsent({
  checked,
  onChange,
  id = "legal-policies-consent",
  className,
}: Props) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-zinc-900/40 px-3 py-3 text-sm ${className ?? ""}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-border accent-accent"
      />
      <span>
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <a
            href={termsDocumentHref()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline underline-offset-2 hover:text-accent-dim"
            onClick={(e) => e.stopPropagation()}
          >
            利用規約（{CURRENT_TERMS_VERSION}）
          </a>
          <span className="text-muted">・</span>
          <a
            href={PRICING_DOCUMENT_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline underline-offset-2 hover:text-accent-dim"
            onClick={(e) => e.stopPropagation()}
          >
            料金表
          </a>
          <span className="text-muted">・</span>
          <a
            href={privacyDocumentHref()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline underline-offset-2 hover:text-accent-dim"
            onClick={(e) => e.stopPropagation()}
          >
            プライバシーポリシー（{CURRENT_PRIVACY_VERSION}）
          </a>
        </span>
        を確認し、内容に同意します
        <span className="text-accent"> *</span>
      </span>
    </label>
  );
}
