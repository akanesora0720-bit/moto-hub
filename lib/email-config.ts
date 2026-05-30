/** メール送信設定の解決・診断（Resend SMTP / nodemailer） */

const RESEND_SMTP_HOSTS = new Set(["smtp.resend.com", "smtp.resend.net"]);

export function resolveSmtpPassword(): string | undefined {
  const pass = process.env.SMTP_PASS?.trim();
  const resend = process.env.RESEND_API_KEY?.trim();
  return pass || resend || undefined;
}

export function resolveSmtpPasswordSource(): "SMTP_PASS" | "RESEND_API_KEY" | "none" {
  if (process.env.SMTP_PASS?.trim()) return "SMTP_PASS";
  if (process.env.RESEND_API_KEY?.trim()) return "RESEND_API_KEY";
  return "none";
}

/** 送信元。SMTP_FROM 未設定時に SMTP_USER（resend）へ落とさない */
export function resolveFromAddress(): string | null {
  const raw = process.env.SMTP_FROM?.trim();
  if (!raw) return null;
  if (raw.includes("@")) {
    if (raw.includes("<") && raw.includes(">")) return raw;
    const name = process.env.SMTP_FROM_NAME?.trim() || "Moto-Hub";
    return `${name} <${raw}>`;
  }
  return null;
}

export function isResendSmtpHost(host: string | undefined): boolean {
  if (!host) return false;
  return RESEND_SMTP_HOSTS.has(host.trim().toLowerCase());
}

export function maskApiKey(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length <= 12) return `${key.slice(0, 4)}…`;
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export type EmailConfigDiagnostics = {
  /** アプリが実際に使う送信経路 */
  transport: "smtp-nodemailer";
  resendSmtp: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  smtpUser: string | null;
  /** 実際の From（nodemailer に渡す値） */
  fromAddress: string | null;
  fromConfigured: boolean;
  fromUsesVerifiedDomainHint: boolean;
  fromLooksLikeResendSandbox: boolean;
  apiKeyConfigured: boolean;
  apiKeySource: "SMTP_PASS" | "RESEND_API_KEY" | "none";
  apiKeyMasked: string | null;
  bothPassAndResendSet: boolean;
  passAndResendKeyMatch: boolean | null;
  resendApiDomains: ResendDomainInfo[] | null;
  resendApiError: string | null;
  adminNotificationEmails: string[];
  likelyCauses: string[];
  notes: string[];
};

export type ResendDomainInfo = {
  name: string;
  status: string;
  region?: string;
};

export async function fetchResendAccountDomains(
  apiKey: string,
): Promise<{ domains: ResendDomainInfo[]; error: string | null }> {
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { domains: [], error: `Resend API ${res.status}: ${text.slice(0, 500)}` };
    }
    if (!res.ok) {
      const msg =
        typeof body === "object" && body !== null && "message" in body
          ? String((body as { message: string }).message)
          : text.slice(0, 500);
      return { domains: [], error: `Resend API ${res.status}: ${msg}` };
    }
    const list =
      typeof body === "object" && body !== null && "data" in body
        ? (body as { data: unknown }).data
        : body;
    if (!Array.isArray(list)) {
      return { domains: [], error: "Resend API: unexpected domains response" };
    }
    const domains = list.map((d) => {
      const row = d as Record<string, unknown>;
      return {
        name: String(row.name ?? ""),
        status: String(row.status ?? row.verification_status ?? "unknown"),
        region: row.region != null ? String(row.region) : undefined,
      };
    });
    return { domains, error: null };
  } catch (e) {
    return {
      domains: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function buildEmailConfigDiagnostics(): Promise<EmailConfigDiagnostics> {
  const host = process.env.SMTP_HOST?.trim() || null;
  const user = process.env.SMTP_USER?.trim() || null;
  const pass = resolveSmtpPassword();
  const passSource = resolveSmtpPasswordSource();
  const from = resolveFromAddress();
  const smtpPassRaw = process.env.SMTP_PASS?.trim();
  const resendKeyRaw = process.env.RESEND_API_KEY?.trim();
  const bothSet = !!(smtpPassRaw && resendKeyRaw);
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure =
    process.env.SMTP_SECURE === "true" || String(process.env.SMTP_PORT ?? "") === "465";

  const fromEmail =
    from?.match(/<([^>]+)>/)?.[1] ?? (from?.includes("@") ? from : null);
  const fromDomain = fromEmail?.split("@")[1]?.toLowerCase() ?? null;

  const likelyCauses: string[] = [];
  const notes: string[] = [
    "本アプリは Resend SDK ではなく nodemailer + SMTP です。RESEND_API_KEY だけ設定しても SMTP_PASS が空なら未使用でした（SMTP_PASS 優先・なければ RESEND_API_KEY を使用するよう修正済み）。",
    "550 testing emails… は Resend が「未認証ドメインの From」または「別アカウントの API キー」でよく出ます。",
  ];

  if (!pass) likelyCauses.push("SMTP_PASS / RESEND_API_KEY が未設定");
  if (!host) likelyCauses.push("SMTP_HOST が未設定");
  if (!from) {
    likelyCauses.push(
      "SMTP_FROM が未設定、またはメール形式ではない（未設定時に From が smtp ユーザー名 resend になるとサンドボックス扱いになり得ます）",
    );
  }
  if (from?.includes("onboarding@resend.dev")) {
    likelyCauses.push("From が onboarding@resend.dev のまま（テスト用・他宛不可）");
  }
  if (bothSet && smtpPassRaw !== resendKeyRaw) {
    likelyCauses.push(
      "SMTP_PASS と RESEND_API_KEY が両方あるが値が不一致（SMTP_PASS が優先され、古いテスト用キーの可能性）",
    );
  }
  if (host && !isResendSmtpHost(host)) {
    notes.push(`SMTP_HOST=${host} は Resend 公式 SMTP ホスト名と異なります（通常 smtp.resend.com）。`);
  }

  let resendApiDomains: ResendDomainInfo[] | null = null;
  let resendApiError: string | null = null;
  if (pass && pass.startsWith("re_")) {
    const api = await fetchResendAccountDomains(pass);
    resendApiDomains = api.domains;
    resendApiError = api.error;
    if (api.error) {
      likelyCauses.push(`Resend API でキー検証失敗: ${api.error}`);
    } else {
      const verified = api.domains.filter(
        (d) => d.status.toLowerCase() === "verified",
      );
      if (verified.length === 0) {
        likelyCauses.push("この API キーのアカウントに Verified ドメインがありません");
      } else if (fromDomain) {
        const match = verified.some(
          (d) => d.name.toLowerCase() === fromDomain,
        );
        if (!match) {
          likelyCauses.push(
            `SMTP_FROM のドメイン (${fromDomain}) が、この API キーで Verified なドメイン一覧に含まれません`,
          );
        }
      }
    }
  } else if (pass) {
    notes.push("SMTP パスワードが re_ で始まらないため Resend API によるドメイン照合はスキップしました。");
  }

  const adminRaw =
    process.env.NOTIFICATION_ADMIN_EMAILS?.trim() ||
    process.env.ADMIN_NOTIFICATION_EMAIL?.trim() ||
    "info@moto-hub.jp";

  return {
    transport: "smtp-nodemailer",
    resendSmtp: isResendSmtpHost(host ?? undefined),
    smtpHost: host,
    smtpPort: host ? port : null,
    smtpSecure: host ? secure : null,
    smtpUser: user,
    fromAddress: from,
    fromConfigured: !!process.env.SMTP_FROM?.trim(),
    fromUsesVerifiedDomainHint: fromDomain === "moto-hub.jp",
    fromLooksLikeResendSandbox: !!from?.includes("onboarding@resend.dev"),
    apiKeyConfigured: !!pass,
    apiKeySource: passSource,
    apiKeyMasked: maskApiKey(pass),
    bothPassAndResendSet: bothSet,
    passAndResendKeyMatch: bothSet ? smtpPassRaw === resendKeyRaw : null,
    resendApiDomains,
    resendApiError,
    adminNotificationEmails: adminRaw.split(/[,;]/).map((e) => e.trim()).filter(Boolean),
    likelyCauses,
    notes,
  };
}
