export function normalizeIdentifierInput(input: string): string {
  // NFKC converts many full-width alphanumerics → ASCII.
  let s = input.normalize("NFKC");
  // Remove full-width/half-width spaces.
  s = s.replace(/[\u3000\s]+/g, "");
  // Unify hyphen-like characters.
  s = s.replace(/[‐‑‒–—−ー－]/g, "-");
  // Uppercase latin letters (keeps non-latin as-is).
  s = s.toUpperCase();
  return s;
}

export function normalizeVinStrict(input: string): string {
  return normalizeIdentifierInput(input);
}

export function isStrictVinValid(normalizedVin: string): boolean {
  return normalizedVin.length > 0 && /^[A-Z0-9-]+$/.test(normalizedVin);
}

export function isValidYmdDateString(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Ensure it didn't overflow (e.g. 2026-02-31)
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}
