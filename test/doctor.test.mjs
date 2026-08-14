import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecs } from '../src/parse.mjs';
import { runDoctor } from '../src/doctor.mjs';

const SPECS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'proj', 'specs');
const data = parseSpecs(SPECS);
const ruleIds = spec => new Set(runDoctor(spec).findings.map(f => f.id));

test('spec limpo: sem erros', () => {
  const { counts, findings } = runDoctor(data['001-clean']);
  assert.equal(counts.error, 0);
  // mas tem avisos honestos (FR-003 órfão; US2 sem FR)
  const ids = findings.map(f => f.id);
  assert.ok(ids.includes('FR_ORPHAN'));
  assert.ok(ids.includes('STORY_NO_FR'));
});

test('spec quebrado: detecta os 4 erros', () => {
  const ids = ruleIds(data['002-broken']);
  assert.ok(ids.has('CYCLE'), 'ciclo T001<->T002');
  assert.ok(ids.has('DEP_UNKNOWN'), 'T003 depende de T999');
  assert.ok(ids.has('SELF_DEP'), 'T004 depende de si');
  assert.ok(ids.has('DUP_TASK_ID'), 'T001 duplicado');
});

test('CYCLE aponta uma aresta cuja remoção quebra o ciclo', () => {
  const cyc = runDoctor(data['002-broken']).findings.find(f => f.id === 'CYCLE');
  assert.match(cyc.message, /Quebre a aresta T\d+ → T\d+/);
});

test('determinístico: mesma entrada => mesma saída', () => {
  const a = JSON.stringify(runDoctor(data['002-broken']));
  const b = JSON.stringify(runDoctor(data['002-broken']));
  assert.equal(a, b);
});

test('ordenação canônica: erros antes de avisos antes de infos', () => {
  const findings = runDoctor(data['002-broken']).findings;
  const rank = { error: 0, warn: 1, info: 2 };
  for (let i = 1; i < findings.length; i++) {
    assert.ok(rank[findings[i - 1].severity] <= rank[findings[i].severity]);
  }
});
