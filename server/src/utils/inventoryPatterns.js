/**
 * inventoryPatterns — single source of truth for "undefined SKU" detection.
 *
 * An inventory row is classified as undefined when ANY of its identifying
 * columns (sku, upc, part_number) contains an empty / placeholder value.
 * These values are common artifacts of CSV exports (Excel, Google Sheets,
 * Amazon Seller Central) and tab-delimited uploads.
 *
 * Patterns matched (case-insensitive, whitespace-trimmed):
 *   ''         — empty / null
 *   '"'        — single double-quote (CSV import remnant)
 *   '""'       — double double-quote (CSV import remnant)
 *   'NA'       — common shorthand for "not available"
 *   'N/A'      — same, with slash
 *   '#NA'      — Excel error-code variant
 *   '#N/A'     — Excel error-code variant
 *
 * IMPORTANT: every SQL query that classifies undefined rows MUST use
 * isUndefinedSql() so the rules stay consistent. The frontend mirror
 * lives in js/inventory.js — keep both lists in sync.
 */

const UNDEFINED_PATTERN_LIST = ["''", "'\"'", "'\"\"'", "'NA'", "'N/A'", "'#NA'", "'#N/A'"];

/**
 * Build the IN-clause comparison SQL fragment for a single column.
 *   isUndefinedSql('sku')  →  UPPER(TRIM(COALESCE(sku, ''))) IN ('','"','""','NA','N/A','#NA','#N/A')
 */
export function isUndefinedSql(column) {
  return `UPPER(TRIM(COALESCE(${column}, ''))) IN (${UNDEFINED_PATTERN_LIST.join(', ')})`;
}

/**
 * Build the full "row is undefined" predicate across sku, upc, part_number.
 *   isUndefinedRowSql('i')  →  (i.sku IN (...) OR i.upc IN (...) OR i.part_number IN (...))
 *
 * @param {string} alias - table alias (e.g. 'i') or empty string for unqualified columns.
 */
export function isUndefinedRowSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(
    ${isUndefinedSql(`${p}sku`)}
    OR ${isUndefinedSql(`${p}upc`)}
    OR ${isUndefinedSql(`${p}part_number`)}
  )`;
}
