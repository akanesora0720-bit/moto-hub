import Link from "next/link";
import { TERMS_DOCUMENT_PATH } from "@/lib/legal-policies";

type Props = {
  className?: string;
};

/** @deprecated 表示は TermsDocumentView（/terms#privacy）に集約 */
export function PrivacyDocumentView({ className }: Props) {
  return (
    <p className={`text-sm text-muted ${className ?? ""}`}>
      プライバシーポリシーは{" "}
      <Link href={`${TERMS_DOCUMENT_PATH}#privacy`} className="text-accent underline underline-offset-2">
        利用規約ページ
      </Link>
      に掲載しています。
    </p>
  );
}
