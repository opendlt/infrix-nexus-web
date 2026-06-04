// Cinema-Inbox-Time E3C4 — timeContext.js smoke test.
//
// Verifies (no browser, no devnet):
//   1. getAt() returns null when the URL has no `at` query
//   2. URL `?at=block:1234` round-trips through getAt → withAt
//   3. setAt({block: 5}) syncs the URL via replaceState
//   4. onAtChange subscribers fire on transitions, including to null

import { strict as assert } from 'node:assert';

// ----- Minimal DOM polyfill -----
const replaced = [];
globalThis.window = {
  history: {
    state: null,
    replaceState(state, _title, url) { replaced.push({ state, url }); this.state = state; },
  },
  location: { href: 'http://localhost/#/spine' },
  addEventListener() {},
};
globalThis.window.location = {
  href: 'http://localhost/#/spine',
};
globalThis.URL = URL;

const ctxMod = await import(new URL('../lib/timeContext.js', import.meta.url));
const { initTimeContext, getAt, setAt, withAt, isAtLive, onAtChange } = ctxMod;

function reset(newHref) {
  setAt(null);
  window.location.href = newHref;
  replaced.length = 0;
}

// ----- 1. Defaults to null on a URL with no at -----
window.location.href = 'http://localhost/?other=1';
initTimeContext();
assert.equal(getAt(), null, 'getAt() must be null without ?at=');
assert.equal(isAtLive(), true, 'isAtLive must be true when at is null');
console.log('✓ defaults to null when URL has no ?at');

// ----- 2. URL ?at=block:1234 hydrates -----
reset('http://localhost/?at=block:1234');
initTimeContext();
const at = getAt();
assert.deepEqual(at, { block: 1234 }, `getAt() = ${JSON.stringify(at)}`);
assert.equal(isAtLive(), false);
const merged = withAt({ x: 1 });
assert.deepEqual(merged, { x: 1, at: { block: 1234 } });
console.log('✓ URL ?at=block:1234 hydrates getAt + withAt');

// ----- 3. setAt syncs the URL via replaceState -----
reset('http://localhost/?at=block:1234');
initTimeContext();
setAt({ block: 5 });
assert.equal(replaced.length, 1, 'replaceState must fire once on setAt({block:5})');
assert.ok(replaced[0].url.includes('at=block%3A5') || replaced[0].url.includes('at=block:5'),
  `replaceState URL should contain at=block:5; got ${replaced[0].url}`);
console.log('✓ setAt syncs URL via replaceState');

// ----- 4. onAtChange fires on transitions and on clear -----
reset('http://localhost/');
initTimeContext();
const events = [];
const unsub = onAtChange((a) => events.push(a));
setAt({ block: 100 });
setAt({ block: 100 }); // no-op
setAt({ version: 7 });
setAt(null);
unsub();
setAt({ block: 999 }); // should not push to events
assert.deepEqual(events, [{ block: 100 }, { version: 7 }, null]);
console.log('✓ onAtChange fires once per transition, clears on unsub');

console.log('');
console.log('✓ All Time E3C4 JS smoke checks passed.');
