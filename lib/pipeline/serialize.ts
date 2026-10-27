/** Tiny helpers for JSON-in-string columns (SQLite keeps no native JSON). */

export function storeText(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function parseText(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Parse a stored JSON string array, tolerating its absence. */
export function parseStringArray(value: string | null | undefined): string[] {
  const parsed = parseText(value);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}