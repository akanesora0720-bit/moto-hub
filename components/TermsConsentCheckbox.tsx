import { termsPdfHref } from "@/lib/terms";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  className?: string;
};

export function TermsConsentCheckbox({ checked, onChange, id = "terms-consent", className }: Props) {
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
        <a
          href={termsPdfHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent underline underline-offset-2 hover:text-accent-dim"
          onClick={(e) => e.stopPropagation()}
        >
          利用規約PDF
        </a>
        を確認し、内容に同意します
        <span className="text-accent"> *</span>
      </span>
    </label>
  );
}
