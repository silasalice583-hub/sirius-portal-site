// PDF.js runs in an isolated worker, so main-window polyfills do not apply.
// Keep the worker's helpers in step with the importers for older mobile engines.
if (!Promise.try) Promise.try = (fn, ...args) => new Promise((resolve, reject) => {
  try { resolve(fn(...args)); } catch (error) { reject(error); }
});
if (!Promise.withResolvers) Promise.withResolvers = function () {
  let resolve, reject;
  const promise = new this((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const { WorkerMessageHandler } = await import("./vendor/pdfjs/pdf.worker.min.mjs?v=20260926-legacy1");
export { WorkerMessageHandler };
