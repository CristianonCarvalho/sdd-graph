import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecs } from '../src/parse.mjs';
import { buildGateReport, stringifyCanonical, gateMarkdown, fingerprint } from '../src/gate.mjs';

const SPECS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'proj', 'specs');
const data = parseSpecs(SPECS);

test('gate reprova quando há erros; passa no nível padrão sem erros', () => {
  const { passed, report } = buildGateReport(data);          // 002-broken tem erros
  assert.equal(passed, false);
  assert.ok(report.gate.violations > 0);
  const clean = buildGateReport({ '001-clean': data['001-clean'] });
  assert.equal(clean.passed, true);                          // só avisos, não reprova
});

test('baseline: aceita o legado e reprova só o novo', async () => {
  const first = buildGateReport(data);
  const baseline = first.fingerprints;                        // aceita tudo
  const second = buildGateReport(data, { baseline });
  assert.equal(second.passed, true, 'nada novo => passa');
  // introduz um erro novo: task com auto-dependência
  const mut = structuredClone(data);
  mut['001-clean'].tasks.push({ id: 'T999', deps: ['T999'], depsRaw: ['T999'], priority: 'P1', story: 'US1', frs: [], done: false, label: 'nova' });
  mut['001-clean'].diagnostics = (await import('../src/doctor.mjs')).runDoctor(mut['001-clean']);
  const third = buildGateReport(mut, { baseline });
  assert.equal(third.passed, false, 'erro novo => reprova');
});

test('fingerprint estável para o mesmo achado', () => {
  const f = { id: 'CYCLE', targetKind: 'task', targetId: 'T001' };
  assert.equal(fingerprint('s', f), fingerprint('s', f));
  assert.notEqual(fingerprint('s', f), fingerprint('s', { ...f, targetId: 'T002' }));
});

test('stringifyCanonical é determinístico (chaves ordenadas)', () => {
  const a = stringifyCanonical(buildGateReport(data).report);
  const b = stringifyCanonical(buildGateReport(data).report);
  assert.equal(a, b);
  assert.equal(stringifyCanonical({ b: 1, a: 2 }), stringifyCanonical({ a: 2, b: 1 }));
});

test('gateMarkdown: marcador e link via permalink', () => {
  const md = gateMarkdown(buildGateReport(data).report, { baseUrl: 'https://x/g.html' });
  assert.ok(md.includes('<!-- sdd-graph -->'));
  assert.match(md, /#tab=deps&sel=T\d+/);
});
