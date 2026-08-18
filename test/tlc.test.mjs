import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tlc from '../src/adapters/tlc.mjs';
import { resolveAdapters, parseProject } from '../src/adapters/index.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tlc-proj');
// specsDir é reinterpretado como "um caminho dentro do projeto" — não precisa existir.
const SPECS = path.join(ROOT, 'specs');

test('tlc.detect: verdadeiro com .specs/features/<x>/spec.md, falso fora', () => {
  assert.equal(tlc.detect(SPECS), 1);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-tlc-'));
  assert.equal(tlc.detect(path.join(empty, 'specs')), 0);
  fs.rmSync(empty, { recursive: true, force: true });
});

test('resolveAdapters detecta tlc (fonte única não namespaca)', () => {
  assert.deepEqual(resolveAdapters({ specsDir: SPECS }).map(a => a.name), ['tlc']);
});

const data = parseProject({ specsDir: SPECS });
const unit = data['checkout-flow'];

test('parseProject: slug sem namespace (fonte única) e source:tlc', () => {
  assert.deepEqual(Object.keys(data), ['checkout-flow']);
  assert.equal(unit.source, 'tlc');
});

test('tasks.md: ids, fase (organizacional), deps, checklist → done/inProgress', () => {
  const byId = Object.fromEntries(unit.tasks.map(t => [t.id, t]));
  assert.equal(unit.tasks.length, 6);
  assert.equal(byId.T1.phase, 'Foundation');
  assert.equal(byId.T4.phase, 'Core Implementation');
  assert.equal(byId.T1.done, true);
  assert.equal(byId.T2.done, false);
  assert.equal(byId.T2.inProgress, true); // 1 de 2 itens do "Done when" marcado
  assert.equal(byId.T3.done, false);
  assert.equal(byId.T3.inProgress, false); // nenhum item marcado
  assert.equal(byId.T1.parallel, false); // template do tlc não tem marcador de paralelismo
});

test('tasks.md: dependências (lista por vírgula, filtra inválidas/self)', () => {
  const byId = Object.fromEntries(unit.tasks.map(t => [t.id, t]));
  assert.deepEqual(byId.T1.deps, []);
  assert.deepEqual(byId.T2.deps, ['T1']);
  assert.deepEqual(byId.T4.deps, ['T2']);
  assert.deepEqual(byId.T6.deps, ['T2', 'T4']);
});

test('prioridade/story herdadas do Requirement citado; task sem Requirement fica honesta (null)', () => {
  const byId = Object.fromEntries(unit.tasks.map(t => [t.id, t]));
  assert.deepEqual(byId.T1.frs, ['CHK-01']);
  assert.equal(byId.T1.priority, 'P1');
  assert.deepEqual(byId.T4.frs, ['CHK-03']);
  assert.equal(byId.T4.priority, 'P2');
  assert.equal(byId.T4.story, byId.T5.story); // mesma Story (CHK-03 e T5 citam a mesma)
  // T6 não tem campo **Requirement** no fixture — sem prioridade/story inventados
  assert.deepEqual(byId.T6.frs, []);
  assert.equal(byId.T6.priority, null);
  assert.equal(byId.T6.story, null);
});

test('spec.md: Requirement Traceability e User Stories viram frText/usecases', () => {
  assert.deepEqual(Object.keys(unit.frText).sort(), ['CHK-01', 'CHK-02', 'CHK-03', 'CHK-04']);
  assert.equal(unit.usecases.length, 3);
  const p1 = unit.usecases.find(u => u.priority === 'P1');
  assert.equal(p1.title, 'Guest Checkout');
  assert.equal(p1.actor, 'shopper');
  assert.match(p1.desc, /check out without creating an account/);
});

test('reusa Doctor/confiança sem código novo: CHK-04 órfão, arquitetura heurística', () => {
  const ids = unit.diagnostics.findings.map(f => f.id);
  assert.ok(ids.includes('FR_ORPHAN'), 'CHK-04 não é citado por nenhuma task');
  assert.ok(ids.includes('STORY_NO_FR'), 'a story de CHK-04 (P3) não tem task com FR vinculado');
  assert.equal(unit.arch.source, false); // heurístico (via Where, não import real)
  assert.equal(unit.confidence.dims.task, 100);
  assert.equal(unit.confidence.dims.dep, 100);
  assert.equal(unit.confidence.dims.arch, 50);
});

test('arquitetura heurística lê o campo "Where" das tasks (src/…)', () => {
  const kinds = unit.arch.nodes.map(n => n.kind).sort();
  assert.ok(kinds.includes('api'));
  assert.ok(kinds.includes('service'));
  assert.ok(kinds.includes('integration'));
  assert.ok(kinds.includes('model'));
});

test('parseProject é determinístico', () => {
  assert.equal(JSON.stringify(parseProject({ specsDir: SPECS })), JSON.stringify(parseProject({ specsDir: SPECS })));
});

test('checklist "Done when" com linha em branco entre itens não marca done cedo demais', () => {
  const spec = `# X\n\n## User Stories\n\n### P1: A\n\n**User Story**: As a user, I want a so that b.\n\n**Acceptance Criteria**:\n\n1. The system SHALL do a\n`;
  const tasks = `# X Tasks\n\n## Task Breakdown\n\n### T1: Do thing\n\n**Where**: `+'`src/services/x.ts`'+`\n**Depends on**: None\n\n**Done when**:\n\n- [x] item one\n\n- [ ] item two\n\n**Tests**: none\n**Gate**: build\n`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-tlc-checklist-'));
  const featDir = path.join(dir, '.specs', 'features', 'x');
  fs.mkdirSync(featDir, { recursive: true });
  fs.writeFileSync(path.join(featDir, 'spec.md'), spec);
  fs.writeFileSync(path.join(featDir, 'tasks.md'), tasks);
  const out = tlc.parse(path.join(dir, 'specs'));
  assert.equal(out.x.tasks[0].done, false);
  assert.equal(out.x.tasks[0].inProgress, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Requirement Traceability com prioridade ambígua (2 stories mesma prioridade) não adivinha a story', () => {
  const spec = `# X\n\n## User Stories\n\n### P1: Alpha\n\n**User Story**: As a user, I want alpha so that a.\n\n### P1: Beta\n\n**User Story**: As a user, I want beta so that b.\n\n## Requirement Traceability\n\n| Requirement ID | Story | Phase | Status |\n| --- | --- | --- | --- |\n| X-01 | P1 | Design | Pending |\n`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-tlc-ambig-'));
  const featDir = path.join(dir, '.specs', 'features', 'x');
  fs.mkdirSync(featDir, { recursive: true });
  fs.writeFileSync(path.join(featDir, 'spec.md'), spec);
  const out = tlc.parse(path.join(dir, 'specs'));
  assert.equal(out.x.frText['X-01'], 'P1'); // sem match inequívoco, guarda o texto cru da célula
  fs.rmSync(dir, { recursive: true, force: true });
});
