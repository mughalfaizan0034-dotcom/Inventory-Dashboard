import { runUploadPipeline }   from '../uploads/core/pipelineRunner.js';
import { inventoryImporter }   from '../uploads/importers/inventoryImporter.js';
import { ordersImporter }      from '../uploads/importers/ordersImporter.js';

export function createUploadsService({ uploadsRepo }) {

  function processInventoryUpload(organizationId, userId, stream, filename) {
    return runUploadPipeline({
      importer: inventoryImporter,
      uploadsRepo, organizationId, userId, stream, filename,
    });
  }

  function processOrdersUpload(organizationId, userId, stream, filename) {
    return runUploadPipeline({
      importer: ordersImporter,
      uploadsRepo, organizationId, userId, stream, filename,
    });
  }

  async function getHistory(organizationId, type) {
    return uploadsRepo.getHistory(organizationId, type);
  }

  return { processInventoryUpload, processOrdersUpload, getHistory };
}
