// RUNBOOK-03 — module resolve hook for node --test.
//
// The SPA imports by browser-absolute specifiers (/lib/…, /views/…,
// /components/…). This hook maps them to file URLs under web/ so a real module
// like store.js (and its dep graph) can be imported under node, mirroring how
// the browser serves them from the web root.

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..'); // web/

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('/lib/') || specifier.startsWith('/views/') || specifier.startsWith('/components/') || specifier.startsWith('/cinema-core/')) {
    return { url: pathToFileURL(path.join(webRoot, specifier)).href, shortCircuit: true };
  }
  return next(specifier, context);
}
