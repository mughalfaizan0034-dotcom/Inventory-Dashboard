export function safeString(value) {
  return String(value ?? '').trim();
}

export function parsePositiveInt(raw, field, rowNum) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { error: { row: rowNum, field, value: raw, reason: `${field} is required` } };

  const n = Number(trimmed);
  if (!Number.isFinite(n))  return { error: { row: rowNum, field, value: raw, reason: `${field} must be a whole number` } };
  if (!Number.isInteger(n)) return { error: { row: rowNum, field, value: raw, reason: `${field} must be a whole number (no decimals)` } };
  if (n < 0)                return { error: { row: rowNum, field, value: raw, reason: `${field} must be positive` } };
  return { value: n };
}
