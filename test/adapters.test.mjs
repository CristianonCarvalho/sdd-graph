import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecs } from '../src/parse.mjs';
import speckit from '../src/adapters/speckit.mjs';
import { resolveAdapters, parseProject, ADAPTERS } from '../src/adapters/index.mjs';

const SPECS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'proj', 'specs');

test('speckit.detect: verdadeiro em specs/*/tasks.md, falso fora', () => {
  assert.equal(speckit.detect(SPECS), 1);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-na-'));
  assert.equal(speckit.detect(empty), 0);
  assert.equal(speckit.detect('/caminho/inexistente'), 0);
  fs.rmSync(empty, { recursive: true, force: true });
});

test('resolveAdapters: autodetecta speckit; --adapter filtra; nome inválido falha', () => {
  assert.deepEqual(resolveAdapters({ specsDir: SPECS }).map(a => a.name), ['speckit']);
  assert.deepEqual(resolveAdapters({ specsDir: SPECS, adapter: 'speckit' }).map(a => a.name), ['speckit']);
  assert.throws(() => resolveAdapters({ specsDir: SPECS, adapter: 'bmad' }), /não suportado/);
});

test('parseProject: mesmas unidades que parseSpecs + source:speckit (não-destrutivo)', () => {
  const viaProject = parseProject({ specsDir: SPECS });
  const viaLegacy = parseSpecs(SPECS);
  assert.deepEqual(Object.keys(viaProject).sort(), Object.keys(viaLegacy).sort());
  for (const slug of Object.keys(viaProject)) {
    assert.equal(viaProject[slug].source, 'speckit');
    // o conteúdo do modelo é idêntico ao legado (só acrescenta 'source')
    assert.equal(viaProject[slug].tasks.length, viaLegacy[slug].tasks.length);
    assert.deepEqual(Object.keys(viaProject[slug].frText), Object.keys(viaLegacy[slug].frText));
    assert.equal(viaProject[slug].arch.source, viaLegacy[slug].arch.source);
    assert.equal(viaProject[slug].confidence.index, viaLegacy[slug].confidence.index);
  }
});

test('parseProject é determinístico', () => {
  assert.equal(JSON.stringify(parseProject({ specsDir: SPECS })), JSON.stringify(parseProject({ specsDir: SPECS })));
});

test('adapter SpecKit declara capabilities', () => {
  assert.equal(ADAPTERS[0].name, 'speckit');
  assert.equal(speckit.capabilities.requirements, 'FR');
  assert.equal(speckit.capabilities.architecture, 'from-code');
});
