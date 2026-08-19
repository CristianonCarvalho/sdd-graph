import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeConfidence } from '../src/confidence.mjs';

test('tudo perfeito => 100', () => {
  const r = computeConfidence({
    taskLines: { exact: 10, unmatched: 0 },
    depEdges: { resolved: 5, unresolved: 0 },
    arch: { source: true, baseAmbiguous: false },
    imports: { exact: 8, inferred: 0, unresolved: 0 },
  });
  assert.equal(r.index, 100);
});

test('arquitetura heurística baixa o índice', () => {
  const src = computeConfidence({ taskLines: { exact: 10, unmatched: 0 }, depEdges: { resolved: 5, unresolved: 0 }, arch: { source: true, baseAmbiguous: false } });
  const heur = computeConfidence({ taskLines: { exact: 10, unmatched: 0 }, depEdges: { resolved: 5, unresolved: 0 }, arch: { source: false, baseAmbiguous: false } });
  assert.ok(heur.index < src.index);
  assert.equal(heur.dims.arch, 50);
});

test('dimensão ausente é redistribuída (não penaliza)', () => {
  // sem dep e sem código: só a dimensão task, que é perfeita => 100
  const r = computeConfidence({ taskLines: { exact: 4, unmatched: 0 } });
  assert.equal(r.index, 100);
  assert.deepEqual(Object.keys(r.dims), ['task']);
});

test('dep inferida (fase/[P], sem anotação inline) tem crédito parcial (0.7)', () => {
  const r = computeConfidence({ depEdges: { resolved: 10, unresolved: 0, inferred: 10 } });
  assert.equal(r.dims.dep, 70);
});

test('dep: quando inferred está ausente, mantém a ratio de sempre (retrocompatível)', () => {
  const r = computeConfidence({ depEdges: { resolved: 5, unresolved: 0 } });
  assert.equal(r.dims.dep, 100);
});

test('import inferido (relativo) tem crédito parcial (0.7)', () => {
  const r = computeConfidence({ imports: { exact: 0, inferred: 10, unresolved: 0 } });
  assert.equal(r.dims.import, 70);
});

test('import não resolvido derruba a dimensão', () => {
  const r = computeConfidence({ imports: { exact: 5, inferred: 0, unresolved: 5 } });
  assert.equal(r.dims.import, 50);
});

test('sem nenhuma dimensão => index null', () => {
  assert.equal(computeConfidence({}).index, null);
});
