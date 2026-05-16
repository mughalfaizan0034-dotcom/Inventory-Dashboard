/* ============================================================
   skuValidator.js — Browser-side SKU structure compiler/validator.

   Mirror of server/src/utils/skuValidator.js. Keep BOTH in sync
   whenever the structure JSON shape, prefix-escaping rules, or
   placeholder list changes. Used by:

     - Settings → Organizations edit modal (live preview + "Test SKU")
     - Future: per-row highlighting (deferred to Phase 2)

   Structure JSON shape (single source of truth):
     {
       enabled:      true,
       prefixes:     ["ARA", "BX"],
       separator:    "-",
       box_pattern:  "\\d+",
       upc_pattern:  "\\d{6,14}",
       part_pattern: "[A-Z0-9-]+",
       compiled:     "^(?:ARA|BX)(?:\\d+)-(?:\\d{6,14})-(?:[A-Z0-9-]+)$"
     }
   ============================================================ */

const SkuValidator = (() => {
  const PLACEHOLDER_VALUES = new Set(['', '"', '""', 'NA', 'N/A', '#NA', '#N/A']);
  const RE_META = /[.*+?^${}()|[\]\\]/g;

  function escapeRegexLiteral(s) {
    return String(s ?? '').replace(RE_META, '\\$&');
  }

  function parseStructure(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'object')   return raw;
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch { return null; }
  }

  function compileStructureRegex(struct) {
    const s = parseStructure(struct);
    if (!s || s.enabled === false) return null;

    const prefixes = Array.isArray(s.prefixes)
      ? s.prefixes.map(p => String(p ?? '').trim()).filter(Boolean)
      : [];
    if (!prefixes.length) return null;

    const separator   = s.separator    ?? '-';
    const boxPattern  = s.box_pattern  || '\\d+';
    const upcPattern  = s.upc_pattern  || '\\d+';
    const partPattern = s.part_pattern || '[A-Z0-9-]+';
    const sepEscaped  = escapeRegexLiteral(separator);
    const prefixGroup = `(?:${prefixes.map(escapeRegexLiteral).join('|')})`;

    return `^${prefixGroup}(?:${boxPattern})${sepEscaped}(?:${upcPattern})${sepEscaped}(?:${partPattern})$`;
  }

  function normalizeStructureForStorage(struct) {
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

  function isPlaceholderValue(value) {
    return PLACEHOLDER_VALUES.has(String(value ?? '').trim().toUpperCase());
  }

  // Validate a single SKU against a compiled regex string. Returns
  //   { valid: boolean, reason: 'empty_or_placeholder' | 'structure_mismatch' | null }
  function validateSku(sku, compiledRegex) {
    if (isPlaceholderValue(sku)) {
      return { valid: false, reason: 'empty_or_placeholder' };
    }
    if (!compiledRegex) return { valid: true, reason: null };
    let re;
    try { re = new RegExp(compiledRegex); }
    catch { return { valid: true, reason: null }; }
    return re.test(String(sku ?? '').trim())
      ? { valid: true, reason: null }
      : { valid: false, reason: 'structure_mismatch' };
  }

  return {
    escapeRegexLiteral,
    parseStructure,
    compileStructureRegex,
    normalizeStructureForStorage,
    isPlaceholderValue,
    validateSku,
  };
})();
