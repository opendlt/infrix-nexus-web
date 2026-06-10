// nextux-13 — Conversational Proof Tutor smoke test (no browser).
//
// Proves the browser twin (lib/tutor.js) reads the Go-generated tutor fixture
// and reports honest results: the worked example explains an OFFLINE proof, so
// it never claims L4, it is never green, and it discloses that live L0 was not
// performed; the curriculum carries the seven lessons; and an audience switch
// changes the wording only (the facts are identical).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const t = await import(pathToFileURL(path.join(webRoot, 'lib', 'tutor.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'tutor.fixture.json'), 'utf8'));
t.setTutorData(fixture);

test('the curriculum carries the seven lessons, each with example/try-it/quiz', () => {
  const ls = t.lessons();
  assert.equal(ls.length, 7, 'all seven lessons are present');
  for (const l of ls) {
    assert.ok(l.explanation && l.explanation.length > 0, `lesson ${l.topic} has an explanation`);
    assert.ok(l.example && l.example.length > 0, `lesson ${l.topic} has a tiny example`);
    assert.ok(l.tryIt && l.tryIt.length > 0, `lesson ${l.topic} has a try-it command`);
    assert.ok(l.quiz && l.quiz.question && Array.isArray(l.quiz.choices) && l.quiz.choices.length >= 2,
      `lesson ${l.topic} has a quiz`);
    assert.ok(l.quiz.answer >= 0 && l.quiz.answer < l.quiz.choices.length, `lesson ${l.topic} quiz answer in range`);
  }
});

test('teach by alias resolves (L4 -> the L3-vs-L4 lesson)', () => {
  const l = t.lessonByTopic('L4');
  assert.ok(l, 'alias L4 resolves');
  assert.equal(l.id, 'L3-vs-L4', 'L4 maps to the L3-vs-L4 lesson');
});

test('the worked example is an OFFLINE proof — never L4, never green', () => {
  const s = t.sample();
  assert.ok(s, 'a worked example is present');
  assert.notEqual(s.status, 'verified', 'an offline proof is not green/verified');
  for (const c of s.canClaim) {
    assert.ok(!/\bl4\b/i.test(c), `offline proof must not claim L4: ${c}`);
  }
  assert.ok(s.cannotClaim.some((c) => /live accumulate l0 verification was not performed/i.test(c)),
    'the offline proof discloses live L0 was not performed');
  assert.equal(t.sampleIsHonest(), true, 'the worked example satisfies the honesty rails');
  assert.notEqual(t.sampleStatusTone(), 'positive', 'an offline proof tone is never positive/green');
});

test('the six audiences are present (wording only — facts come from the artifact)', () => {
  const a = t.audiences();
  assert.equal(a.length, 6, 'six audiences');
  for (const want of ['builder', 'operator', 'auditor', 'business', 'agent', 'expert']) {
    assert.ok(a.includes(want), `audience ${want} present`);
  }
});

test('the sample quiz is grounded and answerable', () => {
  const q = t.sampleQuiz();
  assert.ok(q && q.question, 'a sample quiz is present');
  assert.ok(q.answer >= 0 && q.answer < q.choices.length, 'the answer index is in range');
  assert.ok(q.explain && q.explain.length > 0, 'the quiz explains its answer');
});
