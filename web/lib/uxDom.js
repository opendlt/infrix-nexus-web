// Nexus — tiny DOM helpers shared by the Progressive Disclosure components
// (nextux-03). No innerHTML, semantic elements only, so the components are safe
// and testable under the node FakeNode harness.

/** elt creates an element with an optional class and text content. */
export function elt(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

/** setAttrs applies a map of attributes (skips null/undefined). */
export function setAttrs(node, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v != null) node.setAttribute(k, String(v));
  }
  return node;
}
