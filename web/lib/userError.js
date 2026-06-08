// Nexus — error translation layer, browser twin (adoption-08).
//
// The Go pkg/usererror package and the TypeScript SDK both turn a failure into
// one stable code with a title, why-it-matters impact, concrete fixes, and a
// docs link. This module is the browser side: it normalizes an error object
// received from a /v4 REST envelope or a JSON-RPC `data` field into the same
// shape, so a Nexus error panel shows the SAME guidance — keyed on the SAME
// stable code — that the CLI prints and the SDK throws. Nothing is invented:
// if the server did not translate the error, the panel falls back to a
// generic, still-honest "something went wrong" rather than a raw stack trace.

const STABLE_CODE = /^[A-Z][A-Z0-9_]+$/;

/** True when code is a stable usererror code (not a numeric RPC code). */
export function isStableErrorCode(code) {
  return typeof code === 'string' && STABLE_CODE.test(code);
}

/**
 * normalizeUserError coerces any candidate into the canonical UserError view
 * { code, title, message, impact, cause, fixes[], docs, retryable, supportData }.
 * Missing fields are filled with safe defaults. Returns null if the input has
 * no usable code at all.
 */
export function normalizeUserError(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const code = isStableErrorCode(payload.code) ? payload.code : 'UNKNOWN';
  const fixes = Array.isArray(payload.fixes)
    ? payload.fixes
        .filter((f) => f && typeof f === 'object')
        .map((f) => ({
          label: String(f.label || ''),
          command: f.command ? String(f.command) : '',
          safeToRun: f.safeToRun === true,
        }))
    : [];
  return {
    code,
    title: String(payload.title || 'Something went wrong'),
    message: String(payload.message || ''),
    impact: payload.impact ? String(payload.impact) : '',
    cause: payload.cause ? String(payload.cause) : '',
    fixes,
    docs: payload.docs ? String(payload.docs) : '',
    retryable: payload.retryable === true,
    supportData:
      payload.supportData && typeof payload.supportData === 'object' ? payload.supportData : {},
  };
}

/**
 * parseUserError extracts a normalized UserError from a server error object.
 * Accepts the v4 envelope { code, message, details: <UserError> }, a JSON-RPC
 * error { code, message, data: <UserError> }, or a bare UserError payload.
 * Returns null when the error was not translated (a legacy numeric code with no
 * details), so callers can decide their own fallback.
 */
export function parseUserError(errObj) {
  if (!errObj || typeof errObj !== 'object') return null;
  if (errObj.details && isStableErrorCode(errObj.details.code)) {
    return normalizeUserError(errObj.details);
  }
  if (errObj.data && isStableErrorCode(errObj.data.code)) {
    return normalizeUserError(errObj.data);
  }
  if (isStableErrorCode(errObj.code)) {
    return normalizeUserError(errObj);
  }
  return null;
}

/** A plain-text rendering, parallel to Go RenderHuman (used by tests/logs). */
export function renderUserErrorText(ue) {
  const u = normalizeUserError(ue) || normalizeUserError({ code: 'UNKNOWN' });
  const lines = [`✘ ${u.title}  [${u.code}]`];
  if (u.message) lines.push('', `  ${u.message}`);
  if (u.impact) lines.push('', `  Why it matters: ${u.impact}`);
  if (u.fixes.length) {
    lines.push('', '  Try:');
    for (const f of u.fixes) {
      lines.push(`    • ${f.label}`);
      if (f.command) lines.push(`        ${f.command}`);
    }
  }
  if (u.retryable) lines.push('', '  This is often transient — retrying may succeed.');
  if (u.docs) lines.push('', `  Docs: ${u.docs}`);
  return lines.join('\n');
}
