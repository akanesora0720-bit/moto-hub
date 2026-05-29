import Link from "next/link";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  PRICING_DOCUMENT_PATH,
  PRIVACY_DOCUMENT_PATH,
  TERMS_DOCUMENT_PATH,
} from "@/lib/legal-policies";

type Props = {
  className?: string;
  /** ログイン前は新しいタブで開く */
  openInNewTab?: boolean;
};

const linkClass =
  "font-medium text-accent underline underline-offset-2 hover:text-accent-dim";

export function LegalDocumentLinks({ className, openInNewTab = false }: Props) {
  const target = openInNewTab ? "_blank" : undefined;
  const rel = openInNewTab ? "noopener noreferrer" : undefined;

  return (
    <p className={`text-center text-xs text-muted ${className ?? ""}`}>
      <Link href={TERMS_DOCUMENT_PATH} target={target} rel={rel} className={linkClass}>
        利用規約（{CURRENT_TERMS_VERSION}）
      </Link>
      <span className="mx-1.5">·</span>
      <Link href={PRIVACY_DOCUMENT_PATH} target={target} rel={rel} className={linkClass}>
        プライバシーポリシー（{CURRENT_PRIVACY_VERSION}）
      </Link>
      <span className="mx-1.5">·</span>
      <Link href={PRICING_DOCUMENT_PATH} target={target} rel={rel} className={linkClass}>
        料金表
      </Link>
    </p>
  );
}
