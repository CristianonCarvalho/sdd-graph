import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import reversa from '../src/adapters/reversa.mjs';
import { resolveAdapters, parseProject } from '../src/adapters/index.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'reversa-proj');
// specsDir é reinterpretado como "um caminho dentro do projeto" — não precisa existir.
const SPECS = path.join(ROOT, 'specs');

test('reversa.detect: verdadeiro com _reversa_forward/<x>/actions.md, falso fora', () => {
  assert.equal(reversa.detect(SPECS), 1);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-rv-'));
  assert.equal(reversa.detect(path.join(empty, 'specs')), 0);
  fs.rmSync(empty, { recursive: true, force: true });
});

test('resolveAdapters detecta reversa (fonte única não namespaca)', () => {
  assert.deepEqual(resolveAdapters({ specsDir: SPECS }).map(a => a.name), ['reversa']);
});

const data = parseProject({ specsDir: SPECS });
const unit = data['001-checkout'];

test('parseProject: slug sem namespace (fonte única) e source:reversa', () => {
  assert.deepEqual(Object.keys(data), ['001-checkout']);
  assert.equal(unit.source, 'reversa');
});

test('actions.md: ids, fase→prioridade (Preparação=SETUP, Polimento=POLISH), paralelismo, status', () => {
  const byId = Object.fromEntries(unit.tasks.map(t => [t.id, t]));
  assert.equal(unit.tasks.length, 6);
  assert.equal(byId.T001.priority, 'SETUP');
  assert.equal(byId.T001.parallel, true);
  assert.equal(byId.T001.done, true);
  assert.equal(byId.T001.targetFile, 'src/config/env.py');
  assert.equal(byId.T006.priority, 'POLISH');
  assert.equal(byId.T005.done, false);
  assert.equal(byId.T005.inProgress, false); // formato só tem [ ]/[X]
});

test('actions.md: dependências (lista por vírgula, filtra inválidas/self)', () => {
  const byId = Object.fromEntries(unit.tasks.map(t => [t.id, t]));
  assert.deepEqual(byId.T003.deps, ['T002']);
  assert.deepEqual(byId.T004.deps, ['T001', 'T003']);
  assert.deepEqual(byId.T006.deps, ['T005']);
});

test('prioridade herdada do MoSCoW do RF citado, quando a fase não define uma', () => {
  const byId = Object.fromEntries(unit.tasks.map(t => [t.id, t]));
  // T003/T004 estão na Fase 3 (sem mapeamento de prioridade), mas citam RF-01/RF-02 (Must => P1)
  assert.deepEqual(byId.T003.frs, ['RF-01']);
  assert.equal(byId.T003.priority, 'P1');
  assert.equal(byId.T004.priority, 'P1');
  // T005 não cita nenhum RF e está numa fase sem mapeamento => sem prioridade (honesto)
  assert.equal(byId.T005.priority, null);
});

test('requirements.md: RF-XX com prioridade MoSCoW e personas viram casos de uso', () => {
  assert.deepEqual(Object.keys(unit.frText).sort(), ['RF-01', 'RF-02', 'RF-03']);
  assert.match(unit.frText['RF-02'], /gateway/);
  assert.equal(unit.usecases.length, 1);
  assert.equal(unit.usecases[0].actor, 'Comprador');
  assert.equal(unit.usecases[0].id, 'US1');
});

test('reusa Doctor/confiança sem código novo: RF-03 órfão, arquitetura heurística', () => {
  const ids = unit.diagnostics.findings.map(f => f.id);
  assert.ok(ids.includes('FR_ORPHAN'), 'RF-03 não é citado por nenhuma task');
  assert.equal(unit.arch.source, false); // heurístico (via Arquivo alvo, não import real)
  assert.equal(unit.confidence.dims.task, 100);
  assert.equal(unit.confidence.dims.dep, 100);
  assert.equal(unit.confidence.dims.arch, 50);
});

test('arquitetura heurística lê o "Arquivo alvo" (src/…) das ações', () => {
  const kinds = unit.arch.nodes.map(n => n.kind).sort();
  assert.ok(kinds.includes('api'));
  assert.ok(kinds.includes('service'));
  assert.ok(kinds.includes('integration'));
  assert.ok(kinds.includes('model'));
});

test('parseProject é determinístico', () => {
  assert.equal(JSON.stringify(parseProject({ specsDir: SPECS })), JSON.stringify(parseProject({ specsDir: SPECS })));
});
