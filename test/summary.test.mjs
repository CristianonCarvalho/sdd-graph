import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecs } from '../src/parse.mjs';
import { buildSummary } from '../src/summary.mjs';

const SPECS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'proj', 'specs');
const data = parseSpecs(SPECS);

test('resumo tem as seções esperadas', () => {
  const md = buildSummary(data, 'proj');
  for (const h of ['### Progresso', '### Caminho crítico', '### Gargalos', '### Próximas desbloqueáveis', '### Doctor']) {
    assert.ok(md.includes(h), `falta ${h}`);
  }
  assert.match(md, /Confiança do relatório: \d+%/);
});

test('caminho crítico vai da fundação para a feature', () => {
  const md = buildSummary({ '001-clean': data['001-clean'] }, 'proj');
  // T001 (setup) -> T002 -> T003 é a cadeia mais longa
  assert.match(md, /`T001 → T002 → T003`/);
});

test('progresso reflete os checkboxes', () => {
  const md = buildSummary({ '001-clean': data['001-clean'] }, 'proj');
  assert.match(md, /Concluídas: 1 \(25%\)/); // 1 de 4 (T001 = [X])
});

test('determinístico', () => {
  assert.equal(buildSummary(data, 'proj'), buildSummary(data, 'proj'));
});
