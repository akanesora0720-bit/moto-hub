import nodemailer from "nodemailer";
import { resolveFromAddress, resolveSmtpPassword } from "@/lib/email-config";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = resolveSmtpPassword();
  const from = resolveFromAddress();

  if (!host || !user || !pass || !from) return null;

  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure =
    process.env.SMTP_SECURE === "true" || String(port) === "465";

  return { host, port, secure, user, pass, from };
}

export function formatMailTransportError(e: unknown): string {
  if (e && typeof e === "object") {
    const err = e as {
      message?: string;
      response?: string;
      responseCode?: number;
      code?: string;
    };
    const parts = [
      err.message,
      err.code ? `code=${err.code}` : null,
      err.responseCode != null ? `smtpCode=${err.responseCode}` : null,
      err.response ? `response=${err.response}` : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }
  return String(e);
}

export async function sendMailMessage(options: {
  to: string | string[];
  subject: string;
  text: string;
}) {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error(
      "SMTP未設定: SMTP_HOST, SMTP_USER, SMTP_PASS（または RESEND_API_KEY）, SMTP_FROM（@moto-hub.jp 等）を Vercel に設定してください。",
    );
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  try {
    const info = await transport.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
    return info;
  } catch (e) {
    throw new Error(formatMailTransportError(e));
  }
}
