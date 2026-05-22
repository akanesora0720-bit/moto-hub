import nodemailer from "nodemailer";

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
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !pass || !from) return null;

  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure =
    process.env.SMTP_SECURE === "true" || String(port) === "465";

  return { host, port, secure, user, pass, from };
}

export async function sendMailMessage(options: {
  to: string | string[];
  subject: string;
  text: string;
}) {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error(
      "SMTP未設定: SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM を Vercel に設定してください。",
    );
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  await transport.sendMail({
    from: config.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
}
