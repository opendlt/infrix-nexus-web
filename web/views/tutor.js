// Nexus — #/tutor Conversational Proof Tutor (nextux-13).
//
// A high-quality interactive surface: a worked example that explains a real
// (offline) proof honestly — what it can and cannot claim — an audience switch
// that changes wording only, a lesson curriculum with a tiny example/try-it/quiz
// per lesson, and the why/expert disclosures. Honest by construction: the
// sample is produced by the real Go explainer, so it refuses L4 for an offline
// proof and is never shown green; the assurance facts never change with the
// audience.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadTutor, isLive, lessons, audiences, sample, sampleQuiz,
  lessonByTopic, sampleStatusTone, sampleIsHonest, whyItMatters,
} from '/lib/tutor.js';

function sourceBanner() {
  const wrap = elt('section', 'tutor-banner');
  setAttrs(wrap, { role: 'note' });
  wrap.appendChild(elt('strong', 'tutor-banner-tag', 'Grounded explanations'));
  wrap.appendChild(elt('span', 'tutor-banner-text',
    ' — every answer is grounded in a real parsed artifact. The tutor never claims L4 without a live L0 confirmation, never invents a proof claim, and never advises bypassing a gate.'));
  const src = elt('p', 'tutor-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive()
    ? 'Live tutor context connected.'
    : 'Showing a worked example (run `infrix tutor explain <artifact.json>` on your own).';
  wrap.appendChild(src);
  return wrap;
}

// explanationPanel renders the worked example: an honest, grounded explanation
// of an offline proof. The audience chips re-render the wording only.
function explanationPanel() {
  const panel = elt('section', 'tutor-explanation');
  setAttrs(panel, { 'aria-label': 'Worked example explanation' });
  panel.appendChild(elt('h3', 'tutor-subtitle', 'What am I looking at?'));

  const s = sample();
  if (!s) {
    panel.appendChild(elt('p', null, 'No worked example is available.'));
    return panel;
  }

  // Audience switch — wording only. The facts below never change.
  const auds = audiences();
  const firstAud = auds[0] || s.audience || 'builder';
  const chips = elt('div', 'tutor-audience-chips');
  setAttrs(chips, { role: 'tablist', 'aria-label': 'Audience (changes wording only)' });
  const summaryEl = elt('p', 'tutor-summary', framedSummary(s, firstAud));
  setAttrs(summaryEl, { 'aria-live': 'polite' });
  auds.forEach((aud, i) => {
    const chip = elt('button', 'tutor-audience-chip', aud);
    setAttrs(chip, { type: 'button', role: 'tab', 'data-audience': aud, 'aria-selected': String(i === 0) });
    chip.addEventListener('click', () => {
      chips.querySelectorAll('.tutor-audience-chip').forEach((c) =>
        c.setAttribute('aria-selected', String(c.getAttribute('data-audience') === aud)));
      summaryEl.textContent = framedSummary(s, aud);
    });
    chips.appendChild(chip);
  });
  panel.appendChild(chips);
  panel.appendChild(summaryEl);

  // Honest status badge — never green unless verified.
  const badge = elt('span', 'tutor-status-badge', statusLabel(s.status));
  setAttrs(badge, { 'data-tone': sampleStatusTone(), 'data-status': s.status });
  panel.appendChild(badge);

  panel.appendChild(claimList('You can claim', s.canClaim, 'tutor-can', '✔'));
  panel.appendChild(claimList('You cannot claim', s.cannotClaim, 'tutor-cannot', '✘'));
  if ((s.nextActions || []).length) {
    panel.appendChild(claimList('What to do next', s.nextActions, 'tutor-next', '→'));
  }
  return panel;
}

// framedSummary applies the audience framing in the browser the same way the Go
// explainer does: the framing differs, the facts do not. For the default (the
// sample's own audience) it shows the exact Go-produced summary.
function framedSummary(s, aud) {
  const core = stripFraming(s.summary);
  switch (aud) {
    case 'auditor': return 'For the record: ' + core;
    case 'business': return 'In plain terms: ' + core;
    case 'operator': return 'Operationally: ' + core;
    case 'agent': return core;
    case 'expert': return core;
    default: return "Here's what this is: " + core;
  }
}

// stripFraming removes a known audience prefix so re-framing is idempotent.
function stripFraming(summary) {
  const prefixes = ['For the record: ', 'In plain terms: ', 'Operationally: ', "Here's what this is: "];
  for (const p of prefixes) {
    if (summary.startsWith(p)) return summary.slice(p.length);
  }
  return summary;
}

function claimList(title, items, cls, mark) {
  const wrap = elt('div', cls);
  wrap.appendChild(elt('h4', 'tutor-claim-title', title));
  const ul = elt('ul', 'tutor-claim-list');
  for (const it of items || []) {
    const li = elt('li', 'tutor-claim');
    li.appendChild(elt('span', 'tutor-claim-mark', mark));
    li.appendChild(elt('span', 'tutor-claim-text', it));
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}

function statusLabel(status) {
  switch (status) {
    case 'verified': return 'verified';
    case 'failed': return 'FAILED — not verified';
    case 'partial': return 'verified locally (partial)';
    default: return 'informational';
  }
}

// lessonsPanel renders the curriculum: each lesson with its tiny example,
// try-it command, and quiz.
function lessonsPanel() {
  const panel = elt('section', 'tutor-lessons');
  setAttrs(panel, { 'aria-label': 'Lesson curriculum' });
  panel.appendChild(elt('h3', 'tutor-subtitle', 'Lessons'));
  for (const l of lessons()) {
    panel.appendChild(lessonCard(l));
  }
  return panel;
}

function lessonCard(l) {
  const card = elt('article', 'tutor-lesson');
  setAttrs(card, { 'data-topic': l.topic });
  card.appendChild(elt('h4', 'tutor-lesson-title', l.title));
  card.appendChild(elt('p', 'tutor-lesson-body', l.explanation));
  if (l.example) {
    const ex = elt('p', 'tutor-lesson-example');
    ex.appendChild(elt('strong', null, 'Example: '));
    ex.appendChild(document.createTextNode(l.example));
    card.appendChild(ex);
  }
  if (l.tryIt) {
    const tryEl = elt('pre', 'tutor-lesson-tryit mono');
    setAttrs(tryEl, { 'aria-label': 'Try it command' });
    tryEl.textContent = l.tryIt;
    card.appendChild(tryEl);
  }
  if (l.quiz && l.quiz.question) {
    card.appendChild(quizBlock(l.quiz));
  }
  return card;
}

function quizBlock(quiz) {
  const det = elt('details', 'tutor-quiz');
  det.appendChild(elt('summary', 'tutor-quiz-summary', 'Quiz: ' + quiz.question));
  const ol = elt('ol', 'tutor-quiz-choices');
  const feedback = elt('p', 'tutor-quiz-feedback');
  setAttrs(feedback, { 'aria-live': 'polite' });
  (quiz.choices || []).forEach((choice, i) => {
    const li = elt('li', 'tutor-quiz-choice');
    const btn = elt('button', 'tutor-quiz-btn', choice);
    setAttrs(btn, { type: 'button', 'data-index': String(i) });
    btn.addEventListener('click', () => {
      const correct = i === quiz.answer;
      feedback.setAttribute('data-correct', String(correct));
      feedback.textContent = (correct ? '✔ Correct. ' : '✘ Not quite. ') + quiz.explain;
    });
    li.appendChild(btn);
    ol.appendChild(li);
  });
  det.appendChild(ol);
  det.appendChild(feedback);
  return det;
}

function whyPanel() {
  const panel = elt('details', 'tutor-why');
  panel.appendChild(elt('summary', 'tutor-why-summary', 'Show me why this matters'));
  panel.appendChild(elt('p', 'tutor-why-body', whyItMatters()));
  return panel;
}

function expertPanel() {
  const panel = elt('details', 'tutor-expert');
  panel.appendChild(elt('summary', 'tutor-expert-summary', 'Expert details'));
  const body = elt('div', 'tutor-expert-body');
  const s = sample();
  const dl = elt('dl', 'tutor-expert-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  if (s) {
    row('Kind', s.kind);
    row('Status', s.status);
    row('Grounded', s.grounded ? 'true' : 'false');
    row('Honest (browser check)', sampleIsHonest() ? 'true' : 'false');
    for (const t of s.technicalDetails || []) row('Detail', t);
  }
  body.appendChild(dl);
  panel.appendChild(body);
  return panel;
}

function populate(body) {
  body.appendChild(sourceBanner());
  const grid = elt('div', 'tutor-grid-layout');
  grid.appendChild(explanationPanel());
  grid.appendChild(lessonsPanel());
  body.appendChild(grid);
  body.appendChild(whyPanel());
  body.appendChild(expertPanel());
}

export const tutorView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace tutor-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Tutor'), { id: 'tutor-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Ask what an Infrix artifact means and get a grounded answer: what you are looking at, what you can and cannot claim, and what to do next. Plus short lessons on proofs, assurance levels, replay, and signatures.'));
    shell.appendChild(header);
    const body = elt('div', 'tutor-body');
    body.appendChild(elt('p', 'tutor-loading', 'Loading the tutor…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadTutor();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'tutor-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the tutor.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
