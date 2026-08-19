import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTaskDeps, parseTasksFile, parseSpecMd, parseSpecs } from '../src/parse.mjs';
import { runDoctor } from '../src/doctor.mjs';

const SPECS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'proj', 'specs');

test('parseTaskDeps: ids soltos, listas e ranges (com dedup)', () => {
  assert.deepEqual(parseTaskDeps('foo (depende de T003)'), ['T003']);
  assert.deepEqual(parseTaskDeps('x (depende de T020, T031)'), ['T020', 'T031']);
  assert.deepEqual(parseTaskDeps('y (depende de T008–T010)'), ['T008', 'T009', 'T010']);
  assert.deepEqual(parseTaskDeps('sem dep'), []);
});

test('parseTaskDeps: bilíngue — "depends on"/"depend on" (EN, formato oficial do spec-kit)', () => {
  assert.deepEqual(parseTaskDeps('foo (depends on T012, T013)'), ['T012', 'T013']);
  assert.deepEqual(parseTaskDeps('bar (depend on T001)'), ['T001']);
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

test('parseTasksFile: infere deps por fase/[P] quando não há anotação inline (formato oficial do spec-kit)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-infer-'));
  const f = path.join(dir, 'tasks.md');
  fs.writeFileSync(f, [
    '## Phase 1: Setup',
    '- [ ] T001 primeira tarefa',
    '- [ ] T002 [P] segunda tarefa',
    '- [ ] T003 [P] terceira tarefa',
    '## Phase 2: Foundational',
    '- [ ] T004 quarta tarefa',
    '- [ ] T005 [P] quinta tarefa',
    '- [ ] T006 sexta tarefa',
    '## Phase 3: User Story 1 - X (Priority: P1)',
    '- [ ] T007 [US1] setima tarefa',
    '- [ ] T008 [P] [US1] oitava tarefa',
    '- [ ] T009 [US1] nona tarefa (depends on T001)',
  ].join('\n'));
  const byId = Object.fromEntries(parseTasksFile(f).map(t => [t.id, t]));

  // Fase 1: sem fase anterior => raiz, nada inferido (bate com "Setup: no dependencies")
  assert.deepEqual(byId.T001.deps, []);
  assert.equal(byId.T001.depsInferred, false);
  assert.deepEqual(byId.T002.deps, []); // [P], mas fase 1 não tem fase anterior
  assert.deepEqual(byId.T003.deps, []);

  // Fase 2: 1ª task e as [P] pegam fan-in completo na fase 1 inteira (gate de fase)
  assert.deepEqual(byId.T004.deps.sort(), ['T001', 'T002', 'T003']);
  assert.equal(byId.T004.depsInferred, true);
  assert.deepEqual(byId.T005.deps.sort(), ['T001', 'T002', 'T003']); // [P], não é a 1ª
  // não-[P], não-1ª da fase: encadeia só na task anterior do arquivo
  assert.deepEqual(byId.T006.deps, ['T005']);
  assert.equal(byId.T006.depsInferred, true);

  // Fase 3: mesmo padrão, gate completo na fase 2 inteira
  assert.deepEqual(byId.T007.deps.sort(), ['T004', 'T005', 'T006']);
  assert.deepEqual(byId.T008.deps.sort(), ['T004', 'T005', 'T006']);

  // Dependência explícita nunca é sobrescrita pela inferência
  assert.deepEqual(byId.T009.deps, ['T001']);
  assert.equal(byId.T009.depsInferred, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseTasksFile: fase vazia não apaga a cadeia de fan-in (achado do revisor-sdd-graph)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-emptyphase-'));
  const f = path.join(dir, 'tasks.md');
  fs.writeFileSync(f, [
    '## Phase 1: Setup',
    '- [ ] T001 primeira tarefa',
    '- [ ] T002 segunda tarefa',
    '## Phase 2: Empty phase (sem tasks)',
    '## Phase 3: Foundational',
    '- [ ] T003 terceira tarefa',
  ].join('\n'));
  const byId = Object.fromEntries(parseTasksFile(f).map(t => [t.id, t]));
  // Fase 2 não tem tasks — a cadeia da Fase 3 tem que pular direto pra Fase 1, não ficar vazia
  assert.deepEqual(byId.T003.deps.sort(), ['T001', 'T002']);
  assert.equal(byId.T003.depsInferred, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseTasksFile: dep explícita apontando pra frente (cruzando fase) não gera CYCLE falso via inferência (achado do revisor-sdd-graph)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-fwddep-'));
  const f = path.join(dir, 'tasks.md');
  fs.writeFileSync(f, [
    '## Phase 1: Setup',
    '- [ ] T001 primeira tarefa (depends on T002)',
    '## Phase 2: Foundational',
    '- [ ] T002 segunda tarefa',
  ].join('\n'));
  const nodes = parseTasksFile(f);
  const byId = Object.fromEntries(nodes.map(t => [t.id, t]));
  assert.deepEqual(byId.T001.deps, ['T002']); // declarada, intacta
  assert.deepEqual(byId.T002.deps, []); // não herda fan-in de quem já depende dela — sem ciclo
  const ids = runDoctor({ tasks: nodes, usecases: [], frText: {}, arch: { nodes: [] } }).findings.map(x => x.id);
  assert.ok(!ids.includes('CYCLE'), 'inferência não pode inventar um ciclo que a fonte não tem');
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

test('parseSpecMd: bilíngue — "As a X," (EN) além de "Como X," (PT)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-actor-'));
  fs.writeFileSync(path.join(dir, 'spec.md'), [
    '### User Story 1 - Login (Priority: P1)',
    'As a user, I want to sign in.',
    '',
    '- **FR-001**: Must validate credentials',
  ].join('\n'));
  const spec = parseSpecMd(dir);
  assert.equal(spec.usecases[0].actor, 'user');
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
