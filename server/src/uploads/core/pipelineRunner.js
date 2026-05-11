import { randomUUID } from 'crypto';
import { parseTxtStream } from './txtStreamParser.js';
import { AppError } from '../../utils/errors.js';

const CHUNK_SIZE = 500;
const MAX_ERRORS = 100;

/**
 * Feed-based CRUD upload pipeline.
 *
 * Phase 1: Stream all rows into adds / updates / removes buckets.
 * Phase 2: Fetch the existing key set for the affected keys.
 * Phase 3: Validate each row against the key set (duplicate / not-found guards).
 * Phase 4: Execute operations in CHUNK_SIZE batches.
 *
 * @returns {{ upload_id, added, updated, removed, failed, errors, filename }}
 */
export async function runUploadPipeline({ importer, uploadsRepo, organizationId, userId, stream, filename }) {
  const { schema } = importer;

  const adds    = []; // [{ row, lineNum }]
  const updates = [];
  const removes = [];
  const errors  = [];
  let   failed  = 0;

  // ── Phase 1: collect ──────────────────────────────────────────────────────
  for await (const event of parseTxtStream(stream)) {
    if (event.type === 'headers') {
      if (schema.required.length) {
        const missing = schema.required.filter(col => !event.headers.includes(col));
        if (missing.length) {
          throw new AppError(400, `TXT missing required columns: ${missing.join(', ')}`);
        }
      }
      continue;
    }

    const { lineNum, raw } = event;
    const result = schema.buildRow(raw, organizationId, lineNum);

    if (result.error) {
      failed++;
      if (errors.length < MAX_ERRORS) errors.push(result.error);
      continue;
    }

    if (result.action === 'Add')    adds.push({ row: result.row, lineNum });
    else if (result.action === 'Update') updates.push({ row: result.row, lineNum });
    else if (result.action === 'Remove') removes.push({ row: result.row, lineNum });
  }

  const totalParsed = adds.length + updates.length + removes.length;
  if (totalParsed === 0 && failed === 0) {
    throw new AppError(400, 'No data rows found in file');
  }

  // ── Phase 2: fetch existing key set ──────────────────────────────────────
  const addKeys    = adds.map(({ row }) => importer.getKey(row));
  const updateKeys = updates.map(({ row }) => importer.getKey(row));
  const removeKeys = removes.map(({ row }) => importer.getKey(row));
  const allKeys    = [...new Set([...addKeys, ...updateKeys, ...removeKeys])];

  const existingKeys = await importer.fetchKeySet(uploadsRepo, organizationId, allKeys);

  // ── Phase 3: validate ────────────────────────────────────────────────────
  const validAdds       = [];
  const validUpdates    = [];
  const validRemoveKeys = [];

  for (const { row, lineNum } of adds) {
    const key = importer.getKey(row);
    if (existingKeys.has(key)) {
      failed++;
      if (errors.length < MAX_ERRORS) {
        errors.push({ row: lineNum, field: importer.keyField, reason: `${key} already exists — use action Update to modify` });
      }
    } else {
      validAdds.push(row);
    }
  }

  for (const { row, lineNum } of updates) {
    const key = importer.getKey(row);
    if (!existingKeys.has(key)) {
      failed++;
      if (errors.length < MAX_ERRORS) {
        errors.push({ row: lineNum, field: importer.keyField, reason: `${key} not found — use action Add to create it` });
      }
    } else {
      validUpdates.push(row);
    }
  }

  for (const { row, lineNum } of removes) {
    const key = importer.getKey(row);
    if (!existingKeys.has(key)) {
      failed++;
      if (errors.length < MAX_ERRORS) {
        errors.push({ row: lineNum, field: importer.keyField, reason: `${key} not found` });
      }
    } else {
      validRemoveKeys.push(key);
    }
  }

  // ── Phase 4: execute ─────────────────────────────────────────────────────
  let added = 0, updated = 0, removed = 0;

  for (let i = 0; i < validAdds.length; i += CHUNK_SIZE) {
    const chunk = validAdds.slice(i, i + CHUNK_SIZE);
    await importer.addBatch(uploadsRepo, chunk);
    added += chunk.length;
  }

  for (let i = 0; i < validUpdates.length; i += CHUNK_SIZE) {
    const chunk = validUpdates.slice(i, i + CHUNK_SIZE);
    await importer.updateBatch(uploadsRepo, organizationId, chunk);
    updated += chunk.length;
  }

  if (validRemoveKeys.length) {
    for (let i = 0; i < validRemoveKeys.length; i += CHUNK_SIZE) {
      await importer.removeBatch(uploadsRepo, organizationId, validRemoveKeys.slice(i, i + CHUNK_SIZE));
    }
    removed = validRemoveKeys.length;
  }

  if (added + updated + removed === 0 && failed === 0) {
    throw new AppError(400, 'No valid rows to process');
  }

  const uploadId = randomUUID();
  await importer.logUpload(uploadsRepo, {
    uploadId,
    organizationId,
    userId,
    filename: filename || `${importer.type}.txt`,
    rowCount: added + updated + removed,
    status:   failed > 0 ? 'partial' : 'success',
  }).catch(() => {});

  return { upload_id: uploadId, added, updated, removed, failed, errors, filename };
}
