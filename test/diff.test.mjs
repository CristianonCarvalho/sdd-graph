import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecs } from '../src/parse.mjs';
import { buildSnapshot, diffReport, diffMarkdown } from '../src/diff.mjs';

const SPECS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'proj', 'specs');

test('buildSnapshot: status, findings e progresso a partir do parse', () => {
  const snap = buildSnapshot(parseSpecs(SPECS));
  assert.equal(snap.kind, 'snapshot');
  const c = snap.specs['001-clean'];
  assert.equal(c.tasks.T001.status, 'done');       // T001 = [X]
  assert.equal(c.tasks.T002.status, 'todo');
  assert.equal(c.progress.total, 4);
  assert.equal(c.progress.done, 1);
  // achados indexados por fingerprint (chave hex de 8 dígitos)
  Object.keys(c.findings).forEach(k => assert.match(k, /^[0-9a-f]{8}$/));
});

// snapshots sintéticos para exercitar o diff isoladamente
const A = { kind: 'snapshot', specs: {
  '001': {
    progress: { total: 3, done: 1, doing: 0 },
    tasks: {
      T001: { status: 'done', priority: 'SETUP', story: null, deps: [], frs: [], label: 'a' },
      T002: { status: 'todo', priority: 'P1', story: 'US1', deps: ['T001'], frs: ['FR-001'], label: 'b' },
      T003: { status: 'todo', priority: 'P2', story: 'US1', deps: ['T002'], frs: [], label: 'c' },
    },
    findings: { 'aaaaaaaa': { id: 'FR_ORPHAN', severity: 'warn', targetKind: 'fr', targetId: 'FR-009', message: 'x' } },
  },
}};
const B = { kind: 'snapshot', specs: {
  '001': {
    progress: { total: 4, done: 2, doing: 1 },
    tasks: {
      T001: { status: 'done', priority: 'SETUP', story: null, deps: [], frs: [], label: 'a' },
      T002: { status: 'done', priority: 'P1', story: 'US1', deps: ['T001'], frs: ['FR-001'], label: 'b' },
      T003: { status: 'doing', priority: 'P1', story: 'US1', deps: ['T002', 'T005'], frs: [], label: 'c' },
      T005: { status: 'todo', priority: 'P3', story: 'US2', deps: [], frs: [], label: 'e' },
    },
    findings: { 'bbbbbbbb': { id: 'CYCLE', severity: 'error', targetKind: 'task', targetId: 'T003', message: 'y' } },
  },
  '002': { progress: { total: 1, done: 0, doing: 0 }, tasks: { T001: { status: 'todo', priority: 'P1', story: null, deps: [], frs: [], label: 'z' } }, findings: {} },
}};

test('diffReport: concluídas, novas, status/prioridade/deps e achados', () => {
  const r = diffReport(A, B);
  const s = r.specs['001'];
  assert.equal(s.status, 'changed');
  assert.deepEqual(s.tasks.completed.map(x => x.id), ['T002']);
  assert.deepEqual(s.tasks.added.map(x => x.id), ['T005']);
  assert.deepEqual(s.tasks.removed, []);
  // T002 (todo→done) e T003 (todo→doing) mudaram de status
  assert.deepEqual(s.tasks.statusChanged.map(x => x.id).sort(), ['T002', 'T003']);
  assert.deepEqual(s.tasks.priorityChanged.map(x => `${x.id}:${x.from}>${x.to}`), ['T003:P2>P1']);
  assert.deepEqual(s.tasks.depsChanged, [{ id: 'T003', added: ['T005'], removed: [], label: 'c' }]);
  assert.deepEqual(s.findings.appeared.map(f => f.id), ['CYCLE']);
  assert.deepEqual(s.findings.resolved.map(f => f.id), ['FR_ORPHAN']);
  assert.equal(s.progress.doneDelta, 1);
  // novo spec inteiro
  assert.deepEqual(r.specsAdded, ['002']);
  assert.equal(r.specs['002'].status, 'added');
  assert.equal(r.totals.completed, 1);
});

test('diffReport: sem mudanças quando os snapshots são iguais', () => {
  const r = diffReport(A, A);
  assert.equal(r.specs['001'].status, 'unchanged');
  assert.equal(r.totals.completed, 0);
  assert.equal(r.totals.tasksAdded, 0);
});

test('diffReport é determinístico', () => {
  assert.equal(JSON.stringify(diffReport(A, B)), JSON.stringify(diffReport(A, B)));
});

test('diffMarkdown: seções esperadas e caso sem mudanças', () => {
  const md = diffMarkdown(diffReport(A, B), { project: 'proj' });
  assert.match(md, /diff do plano — proj/);
  assert.match(md, /✅ Concluídas: T002/);
  assert.match(md, /➕ Novas: T005 \(P3\)/);
  assert.match(md, /⚠️ Achados novos: \[CYCLE\] T003/);
  assert.match(md, /✔️ Achados resolvidos: \[FR_ORPHAN\] FR-009/);
  assert.match(diffMarkdown(diffReport(A, A)), /Sem mudanças/);
});
