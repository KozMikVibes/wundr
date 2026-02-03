export function sanitizeString(input: string, maxLen: number) {
  const s = input.trim().slice(0, maxLen);
  // Remove control chars
  return s.replace(/[\u0000-\u001F\u007F]/g, "");
}

export function sanitizeSlug(input: string) {
  const s = sanitizeString(input, 64).toLowerCase();
  // allowlist: a-z 0-9 hyphen
  if (!/^[a-z0-9-]+$/.test(s)) throw Object.assign(new Error("invalid_slug"), { status: 400 });
  return s;
}
