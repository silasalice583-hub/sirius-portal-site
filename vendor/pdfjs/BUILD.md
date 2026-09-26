# PDF.js browser distribution

Version: 6.3.289 (unchanged). Build: 1c8020a7d.

On 2026-09-26, `pdf.min.mjs` and `pdf.worker.min.mjs` were replaced with the **legacy/build** versions from the official Mozilla `pdfjs-dist` npm package. Both sides use the same version. The existing cmaps, standard fonts, wasm and ICC resources remain unchanged.

Package: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.3.289.tgz

Verified npm SHA-512 integrity:
`ZHjSVpDa3D6izMq8/04lvkhkATUmL9px6ChPaXc1k6nU2Mrhlg1/7F0bdUqCwUjw3NsPTfPZsMDUU6ZIcRaeQw==`

The official legacy build includes missing platform API polyfills used by the library. This broadens compatibility, but does not promise support for every old browser. The worker wrapper adds Promise helpers before loading the worker. Failed loading still has a direct PDF link and retry control.

License: Apache 2.0, see LICENSE and the upstream file headers.
