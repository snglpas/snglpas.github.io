export function normalizeSettlementName(value) {
  if (value === undefined) return "";
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    return null;
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length > 160 ||
    (normalized && !/^[\p{L}\p{M}\p{N} .,\-–—'’"«»_()\/№]+$/u.test(normalized))
  )
    return null;
  return normalized;
}
