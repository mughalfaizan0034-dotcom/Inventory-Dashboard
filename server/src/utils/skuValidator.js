/**
 * skuValidator — centralized SKU structure compile + validate utility.
 *
 * Phase 1 of the SKU Validation & Structure Management system. Replaces
 * scattered "NA / N/A / empty" placeholder checks with a structure-aware
 * validation engine driven by per-organization configuration.
 *
 * Organization SKU structure is stored on `organizations.sku_structure`
 * as a JSON-encoded string. The shape is:
 *
 *   {
 *     "enabled":      true,
 *     "prefixes":     ["ARA", "BX"],
 *     "separator":    "-",
 *     "box_pattern":  "\\d+",
 *     "upc_pattern":  "\\d{6,14}",
 *     "part_pattern": "[A-Z0-9-]+",
 *     "compiled":     "^(?:ARA|BX)(?:\\d+)-(?:\\d{6,14})-(?:[A-Z0-9-]+)$"
 *   }
 *
 *   compiled  — anchored RE2-compatible regex (BigQuery uses RE2). Stored
 *               with the JSON so SQL queries can reference it without
 *               recompiling per request. Always regenerated from the raw
 *               fragments on save.
 *   enabled   — false / missing → no structure-level validation (back-compat).
 *
 * Validation reasons returned by validateSku():
 *   'empty_or_placeholder'  empty / '' / NA / N/A / #N/A / #NA / '"'
 *   'structure_mismatch'    failed the compiled regex
 *   null                    valid
 *
 * Engine principle: fail-open. If a stored regex is malformed, validation
 * degrades to the placeholder check rather than rejecting every row.
 */

const PLACEHOLDER_VALUES = new Set(['', '"', '""', 'NA', 'N/A', '#NA', '#N/A']);

const RE_META = /[.*+?^${}()|[\]\\]/g;

/**
 * Escape a literal string for safe inclusion in a regex (prefix names only —
 * box/upc/part patterns are admin-supplied regex fragments and pass through
 * unescaped on purpose).
 */
export function escapeRegexLiteral(s) {
  return String(s ?? '').replace(RE_META, '\\$&');
}

/**
 * Parse a raw JSON-encoded sku_structure column value into an object.
 * Returns null when the column is empty, malformed, or disabled.
 */
export function parseStructure(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object')   return raw;
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Build the compiled anchored regex string from the raw fragment fields.
 * Returns null when structure is disabled or has no prefixes — callers
 * should treat that as "no structure validation configured".
 */
export function compileStructureRegex(struct) {
  const s = parseStructure(struct);
  if (!s || s.enabled === false) return null;

  const prefixes = Array.isArray(s.prefixes)
    ? s.prefixes.map(p => String(p ?? '').trim()).filter(Boolean)
    : [];
  if (!prefixes.length) return null;

  const separator    = s.separator    ?? '-';
  const boxPattern   = s.box_pattern  || '\\d+';
  const upcPattern   = s.upc_pattern  || '\\d+';
  const partPattern  = s.part_pattern || '[A-Z0-9-]+';
  const sepEscaped   = escapeRegexLiteral(separator);
  const prefixGroup  = `(?:${prefixes.map(escapeRegexLiteral).join('|')})`;

  return `^${prefixGroup}(?:${boxPattern})${sepEscaped}(?:${upcPattern})${sepEscaped}(?:${partPattern})$`;
}

/**
 * Normalize and re-stamp the compiled regex on a structure object before
 * persisting. Returns a fresh object — never mutates input.
 */
export function normalizeStructureForStorage(struct) {
  const s = parseStructure(struct);
  if (!s) return null;
  return {
    enabled:      s.enabled !== false,
    prefixes:     Array.isArray(s.prefixes) ? s.prefixes.map(p => String(p ?? '').trim()).filter(Boolean) : [],
    separator:    typeof s.separator === 'string'    ? s.separator    : '-',
    box_pattern:  typeof s.box_pattern === 'string'  ? s.box_pattern  : '\\d+',
    upc_pattern:  typeof s.upc_pattern === 'string'  ? s.upc_pattern  : '\\d+',
    part_pattern: typeof s.part_pattern === 'string' ? s.part_pattern : '[A-Z0-9-]+',
    compiled:     compileStructureRegex(s) || '',
  };
}

/**
 * Returns true when value matches one of the placeholder strings —
 * unchanged from the legacy inventoryPatterns behavior, exposed here so
 * the validator can be the single source of truth.
 */
export function isPlaceholderValue(value) {
  return PLACEHOLDER_VALUES.has(String(value ?? '').trim().toUpperCase());
}

/**
 * Validate a single SKU against an org's compiled structure regex.
 *
 * @param {string} sku
 * @param {string|null} compiledRegex  — pass null to skip structure-level
 *                                       validation (placeholder check only).
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function validateSku(sku, compiledRegex) {
  if (isPlaceholderValue(sku)) {
    return { valid: false, reason: 'empty_or_placeholder' };
  }
  if (!compiledRegex) return { valid: true, reason: null };

  // RegExp construction failure is treated as "no structure" — fail-open
  // so a malformed config never blocks the dashboard.
  let re;
  try { re = new RegExp(compiledRegex); }
  catch { return { valid: true, reason: null }; }

  return re.test(String(sku ?? '').trim())
    ? { valid: true, reason: null }
    : { valid: false, reason: 'structure_mismatch' };
}
