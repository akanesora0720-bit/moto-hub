import { promises as fs } from "fs";
import path from "path";

export type MotohubLogoBytes = { format: "jpg" | "png"; bytes: Uint8Array };

let cached: MotohubLogoBytes | null | undefined;

/** Server-side logo loader (PDF / API). Bundled path works on Vercel serverless. */
export async function loadMotohubLogoBytes(): Promise<MotohubLogoBytes | null> {
  if (cached !== undefined) return cached;

  const candidates: { abs: string; format: "jpg" | "png" }[] = [
    { abs: path.join(process.cwd(), "lib", "assets", "motohub-logo.jpg"), format: "jpg" },
    { abs: path.join(process.cwd(), "public", "logo.jpg"), format: "jpg" },
    { abs: path.join(process.cwd(), "public", "motohub-logo.png"), format: "png" },
    { abs: path.join(process.cwd(), "LOGO.jpg"), format: "jpg" },
  ];

  for (const c of candidates) {
    try {
      const buf = await fs.readFile(c.abs);
      cached = { format: c.format, bytes: new Uint8Array(buf) };
      return cached;
    } catch {
      // try next path
    }
  }

  cached = null;
  return null;
}
