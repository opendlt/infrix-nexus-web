// Nexus — canonical JSON encoder.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 5: byte-exact mirror of
// pkg/evidence/canonical.go::canonicalJSON. The Go implementation:
//   1. json.Marshal(v) → produces standard JSON
//   2. json.Unmarshal(jsonBytes, &generic) → normalises every nested
//      map[string]X into map[string]any so key sort applies
//   3. writeCanonical: maps emit keys in lexicographic order, slices
//      preserve order, scalars are emitted via json.Marshal
//
// In JS, the canonical encoder takes any value and returns the
// canonical UTF-8 byte string with the same property: keys are
// sorted lexicographically at every nesting level, and scalars are
// re-encoded via JSON.stringify which matches Go's stdlib JSON
// encoder for integers, simple strings, and bools (the Go comment
// in canonical.go:28 explicitly notes this is NOT full JCS — for
// our case integer-only number fields suffice).
//
// Important: Go's [N]byte fields (e.g. PlanHash [32]byte) JSON-encode
// as integer arrays `[1,2,3,...]`. JS sees them as `Array<number>`
// after JSON.parse. Both languages produce byte-identical canonical
// output for these because writeCanonical encodes each scalar through
// the stdlib encoder.

/**
 * Canonical-JSON encode `v` to a UTF-8 byte string.
 * @param {*} v
 * @returns {string} the canonical JSON
 */
export function canonicalJSON(v) {
  return writeCanonical(v);
}

/**
 * Canonical-JSON encode `v` and return its SHA-256 as a Uint8Array.
 * @param {*} v
 * @returns {Promise<Uint8Array>}
 */
export async function canonicalJSONSha256(v) {
  const utf8 = new TextEncoder().encode(canonicalJSON(v));
  const buf = await crypto.subtle.digest('SHA-256', utf8);
  return new Uint8Array(buf);
}

function writeCanonical(v) {
  if (v === null || v === undefined) {
    return 'null';
  }
  if (typeof v === 'boolean' || typeof v === 'number') {
    return JSON.stringify(v);
  }
  if (typeof v === 'string') {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    let out = '[';
    for (let i = 0; i < v.length; i++) {
      if (i > 0) out += ',';
      out += writeCanonical(v[i]);
    }
    out += ']';
    return out;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v).sort();
    let out = '{';
    let first = true;
    for (const k of keys) {
      // Skip undefined values to match Go's behaviour (json.Marshal
      // omits fields with omitempty when zero).
      if (v[k] === undefined) continue;
      if (!first) out += ',';
      first = false;
      out += JSON.stringify(k);
      out += ':';
      out += writeCanonical(v[k]);
    }
    out += '}';
    return out;
  }
  throw new Error('canonicalJSON: unsupported type ' + typeof v);
}

/**
 * Compare two Uint8Array byte-by-byte. Returns true on equal lengths
 * + equal contents.
 */
export function bytesEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Hex-encode a Uint8Array. */
export function bytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/**
 * Coerce a "32-byte hash" to a Uint8Array. The Go portable package
 * encodes [32]byte fields as JSON integer arrays of length 32, so
 * the JSON-parsed shape is `Array<number>`. Some operators may also
 * paste a hex string in for testing — accept both.
 */
export function coerce32(v) {
  if (!v) return new Uint8Array(32);
  if (v instanceof Uint8Array) {
    if (v.length === 32) return v;
    const out = new Uint8Array(32);
    out.set(v.subarray(0, Math.min(32, v.length)), 0);
    return out;
  }
  if (Array.isArray(v)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < Math.min(32, v.length); i++) out[i] = v[i] & 0xff;
    return out;
  }
  if (typeof v === 'string') {
    const hex = v.replace(/^0x/i, '');
    if (/^[0-9a-fA-F]*$/.test(hex) && hex.length === 64) {
      const out = new Uint8Array(32);
      for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    if (/^[A-Za-z0-9+/=]+$/.test(v)) {
      try {
        const bin = atob(v);
        if (bin.length === 32) {
          const out = new Uint8Array(32);
          for (let i = 0; i < 32; i++) out[i] = bin.charCodeAt(i);
          return out;
        }
      } catch (e) { /* fall through */ }
    }
  }
  return new Uint8Array(32);
}

/** True iff every byte of v is zero. */
export function isZero32(v) {
  const b = coerce32(v);
  for (let i = 0; i < 32; i++) if (b[i] !== 0) return false;
  return true;
}

/** SHA-256 over a Uint8Array. */
export async function sha256(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

/** Concatenate two Uint8Arrays. */
export function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
