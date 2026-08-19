import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTaskDeps, parseTasksFile, parseSpecMd, parseSpecs } from '../src/parse.mjs';

const SPECS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'proj', 'specs');

test('parseTaskDeps: ids soltos, listas e ranges (com dedup)', () => {
  assert.deepEqual(parseTaskDeps('foo (depende de T003)'), ['T003']);
  assert.deepEqual(parseTaskDeps('x (depende de T020, T031)'), ['T020', 'T031']);
  assert.deepEqual(parseTaskDeps('y (depende de T008–T010)'), ['T008', 'T009', 'T010']);
  assert.deepEqual(parseTaskDeps('sem dep'), []);
});

test('parseTasksFile: extrai id, done, prioridade, story, deps e depsRaw', () => {
  const tasks = parseTasksFile(path.join(SPECS, '001-clean', 'tasks.md'));
  const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
  assert.equal(tasks.length, 4);
  assert.equal(byId.T001.done, true);
  assert.equal(byId.T001.priority, 'SETUP');
  assert.equal(byId.T002.priority, 'P1');
  assert.equal(byId.T002.story, 'US1');
  assert.deepEqual(byId.T002.deps, ['T001']);
  assert.deepEqual(byId.T002.frs, ['FR-001']);
});

test('parseTasksFile: deps inválidas filtradas em deps mas preservadas em depsRaw', () => {
  const tasks = parseTasksFile(path.join(SPECS, '002-broken', 'tasks.md'));
  const t3 = tasks.find(t => t.id === 'T003');
  assert.deepEqual(t3.deps, []);          // T999 removido
  assert.deepEqual(t3.depsRaw, ['T999']); // preservado p/ o Doctor
});

test('parseTasksFile: [~] marca task em andamento (nem done, nem aberta)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
  const f = path.join(dir, 'tasks.md');
  fs.writeFileSync(f, [
    '## Phase 1: Setup',
    '- [X] T001 feita',
    '- [~] T002 em andamento',
    '- [ ] T003 aberta',
  ].join('\n'));
  const byId = Object.fromEntries(parseTasksFile(f).map(t => [t.id, t]));
  assert.equal(byId.T001.done, true);
  assert.equal(byId.T001.inProgress, false);
  assert.equal(byId.T002.done, false);
  assert.equal(byId.T002.inProgress, true);
  assert.equal(byId.T003.done, false);
  assert.equal(byId.T003.inProgress, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseTasksFile: tolera CRLF (\\r\\n) — arquivo editado no Windows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-crlf-'));
  const f = path.join(dir, 'tasks.md');
  fs.writeFileSync(f, [
    '## Phase 1: Setup',
    '- [X] T001 feita',
    '## Phase 2: User Story 1 - Login (Priority: P1)',
    '- [ ] T002 [P] faz algo (FR-001)',
  ].join('\r\n'));
  const byId = Object.fromEntries(parseTasksFile(f).map(t => [t.id, t]));
  assert.equal(Object.keys(byId).length, 2, 'CRLF não pode zerar o parsing de tasks');
  assert.equal(byId.T001.done, true);
  assert.equal(byId.T001.priority, 'SETUP');
  assert.equal(byId.T002.priority, 'P1');
  assert.equal(byId.T002.story, 'US1');
  assert.equal(byId.T002.parallel, true);
  assert.deepEqual(byId.T002.frs, ['FR-001']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseSpecMd: tolera CRLF (\\r\\n) no spec.md', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-crlf-'));
  fs.writeFileSync(path.join(dir, 'spec.md'), [
    '### User Story 1 - Login (Priority: P1)',
    'Como usuário, quero entrar no sistema.',
    '',
    '- **FR-001**: Deve validar credenciais',
  ].join('\r\n'));
  const spec = parseSpecMd(dir);
  assert.equal(spec.usecases.length, 1);
  assert.equal(spec.usecases[0].actor, 'usuário');
  assert.deepEqual(Object.keys(spec.frText), ['FR-001']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseSpecs: casos de uso, FRs e arquitetura lida do código (imports relativos)', () => {
  const data = parseSpecs(SPECS);
  assert.deepEqual(Object.keys(data).sort(), ['001-clean', '002-broken']);
  const c = data['001-clean'];
  assert.equal(c.usecases.length, 2);
  assert.equal(Object.keys(c.frText).length, 3);
  // arquitetura derivada do código (Python), via imports RELATIVOS
  assert.equal(c.arch.source, true);
  const labels = c.arch.nodes.map(n => n.label);
  assert.ok(labels.includes('binance adapter'), 'deve inferir o adapter binance do import relativo');
  assert.ok(labels.some(l => /Modelos/.test(l)), 'deve ligar aos modelos');
  // proveniência: imports relativos => inferred > 0
  assert.ok(c.arch.provenance.imports.inferred > 0);
});

test('parseSpecs: confidence e diagnostics presentes por spec', () => {
  const data = parseSpecs(SPECS);
  for (const slug of Object.keys(data)) {
    assert.ok(data[slug].confidence && typeof data[slug].confidence.index === 'number');
    assert.ok(data[slug].diagnostics && Array.isArray(data[slug].diagnostics.findings));
  }
});
