// Nexus — in-browser proof-story verifier (nextux-02).
//
// Verifies a shareable .infrixstory.json against its artifacts entirely in the
// browser (or Node): it recomputes every manifested file's SHA-256, rejects
// unmanifested artifacts, confirms the Cinema replay binds to the proof, and
// rejects any story that OVERCLAIMS (an L4 claim without l0Verified). This is
// the same honesty contract the Go verifier enforces; full L0 confirmation
// stays server-side.

const RECOGNIZED_SUFFIX = '.infrix.json';

export function isRecognizedArtifact(name) {
  return (
    name === 'scenario.yaml' ||
    name === 'receipt.infrix.json' ||
    name === 'verify.txt' ||
    name.endsWith(RECOGNIZED_SUFFIX)
  );
}

function toBytes(v) {
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'string') return new TextEncoder().encode(v);
  // base64 fallback handled by the caller; treat anything else as empty.
  return new Uint8Array(0);
}

export async function sha256Hex(v) {
  const bytes = toBytes(v);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// verifyStoryStructure verifies a story against a {filename: bytes|string} map.
// Returns { ok, checks: [{name, ok, detail}] }.
export async function verifyStoryStructure(story, files, opts = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  if (!story || story.version !== 1) {
    add('version', false, 'unsupported story version');
    return { ok: false, checks };
  }

  const manifested = new Set();
  let manifestOK = true;
  for (const m of story.manifest || []) {
    manifested.add(m.file);
    const data = files[m.file];
    if (data == null) {
      add('manifest:' + m.file, false, 'missing');
      manifestOK = false;
      continue;
    }
    const bytes = toBytes(data);
    const sum = await sha256Hex(bytes);
    if (sum !== m.sha256 || bytes.length !== m.bytes) {
      add('manifest:' + m.file, false, 'checksum/size mismatch');
      manifestOK = false;
    }
  }
  add('manifest', manifestOK, manifestOK ? 'all manifested files match' : 'a manifested file failed');

  for (const name of Object.keys(files)) {
    if (name === 'story.infrixstory.json') continue;
    if (isRecognizedArtifact(name) && !manifested.has(name)) {
      add('unmanifested:' + name, false, 'artifact present but not in manifest');
    }
  }

  for (const [logical, file] of Object.entries(story.artifacts || {})) {
    if (!manifested.has(file)) add('artifact:' + logical, false, file + ' not in manifest');
  }

  const a = story.assurance || {};
  if (String(a.proofLevel).toUpperCase() === 'L4' && !a.l0Verified) {
    add('honesty:l4', false, 'L4 claimed without l0Verified');
  }
  if (a.verified && !['L1', 'L2', 'L3', 'L4'].includes(String(a.proofLevel).toUpperCase())) {
    add('honesty:level', false, 'verified without a real proof level');
  }
  if ((a.l0Verified || String(a.proofLevel).toUpperCase() === 'L4') && opts.l0Confirmed === false) {
    add('l0', false, 'story claims L0/L4 but no L0 confirmation is available here');
  }

  const cinemaFile = story.artifacts && story.artifacts.cinemaReplay;
  if (cinemaFile && files[cinemaFile] != null) {
    try {
      const text = typeof files[cinemaFile] === 'string'
        ? files[cinemaFile]
        : new TextDecoder().decode(toBytes(files[cinemaFile]));
      const cinema = JSON.parse(text);
      const ok = cinema.boundOutcomeDigest === story.cinemaBinding;
      add('cinema-binding', ok, ok ? 'binds to the proof' : 'does not bind to the proof');
    } catch {
      add('cinema-binding', false, 'cinema artifact is not valid JSON');
    }
  }

  return { ok: checks.every((c) => c.ok), checks };
}

// verifyShareBundle decodes a self-contained share bundle (files are base64) and
// verifies its embedded story.
export async function verifyShareBundle(bundle, opts = {}) {
  if (!bundle || !bundle.story) return { ok: false, checks: [{ name: 'bundle', ok: false, detail: 'empty bundle' }] };
  const files = {};
  for (const [name, b64] of Object.entries(bundle.files || {})) {
    files[name] = base64ToBytes(b64);
  }
  return verifyStoryStructure(bundle.story, files, opts);
}

function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback.
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
