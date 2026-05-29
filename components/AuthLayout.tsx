import { MotohubLogo } from "@/components/MotohubLogo";
import { BRAND } from "@/lib/brand";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <MotohubLogo priority labelClassName="text-xl sm:text-2xl" />
          </div>
          <h1 className="mt-2 text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <p className="mt-2 text-xs text-muted">
            {BRAND.companyName} ·{" "}
            <a href={`mailto:${BRAND.contactEmail}`} className="text-accent hover:underline">
              {BRAND.contactEmail}
            </a>
          </p>
        </div>
        <div className="p-6">{children}</div>
      </section>
    </main>
  );
}
