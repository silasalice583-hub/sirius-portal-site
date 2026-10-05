import { chunkedPdfResponse } from '../../../../pdf-chunk-response.mjs';
import file from '../../../../goddess-pdf-parts.mjs';

export function onRequest({ request, env }) {
  return chunkedPdfResponse(request, env.ASSETS, file);
}
