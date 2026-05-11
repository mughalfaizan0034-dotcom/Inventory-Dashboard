import { randomUUID } from 'crypto';
import { parseTxtStream } from './txtStreamParser.js';
import { AppError } from '../../utils/errors.js';

const CHUNK_SIZE  = 500;
const MAX_ERRORS  = 100; // cap error collection; all errors counted in skipped

/**
 * Unified upload ingestion engine.
 *
 * @param {object} opts
 * @param {object} opts.importer       - { schema, prepare, insertBatch, logUpload, type }
 * @param {object} opts.uploadsRepo    - repository with insert/log methods
 * @param {string} opts.organizationId
 * @param {string} opts.userId
 * @param {Readable} opts.stream       - multipart file stream from @fastify/multipart
 * @param {string} opts.filename
 * @returns {{ upload_id, inserted, skipped, errors, filename }}
 */
export async function runUploadPipeline({ importer, uploadsRepo, organizationId, userId, stream, filename }) {
  const { schema } = importer;

  const errors   = [];
  let batch      = [];
  let inserted   = 0;
  let skipped    = 0;
  let prepared   = false;

  for await (const event of parseTxtStream(stream)) {
    if (event.type === 'headers') {
      const missing = schema.required.filter(col => !event.headers.includes(col));
      if (missing.length) {
        throw new AppError(400, `TXT missing required columns: ${missing.join(', ')}`);
      }
      continue;
    }

    const { lineNum, raw } = event;
    const result = schema.buildRow(raw, organizationId, lineNum);

    if (result.error) {
      skipped++;
      if (errors.length < MAX_ERRORS) errors.push(result.error);
      continue;
    }

    batch.push(result.row);

    if (batch.length >= CHUNK_SIZE) {
      if (!prepared) {
        await importer.prepare(uploadsRepo, organizationId);
        prepared = true;
      }
      await importer.insertBatch(uploadsRepo, batch);
      inserted += batch.length;
      batch = [];
    }
  }

  // Flush remaining rows
  if (batch.length > 0) {
    if (!prepared) await importer.prepare(uploadsRepo, organizationId);
    await importer.insertBatch(uploadsRepo, batch);
    inserted += batch.length;
  }

  if (inserted === 0 && skipped === 0) {
    throw new AppError(400, 'No data rows found in file');
  }

  const uploadId = randomUUID();
  await importer.logUpload(uploadsRepo, {
    uploadId,
    organizationId,
    userId,
    filename:  filename || `${importer.type}.txt`,
    rowCount:  inserted,
    status:    skipped > 0 ? 'partial' : 'success',
  }).catch(() => {}); // log failures are non-fatal

  return { upload_id: uploadId, inserted, skipped, errors, filename };
}
