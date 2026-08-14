import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanJsSource, scanGoSource } from '../src/parse.mjs';

function tmp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-arch-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}
const findImp = (scan, mod, group) => scan.files.find(f => f.module === mod).imports.find(i => i.group === group);

test('scanJsSource: relativo (inferido), alias @/ (exato) e bare ignorado', () => {
  const dir = tmp({
    'services/pedido.ts': `import { Bar } from '../integrations/gateway';\nimport { Baz } from '@/models/pedido';\nimport React from 'react';\nexport const x = 1;`,
    'integrations/gateway.ts': `export const g = 1;`,
    'models/pedido.ts': `export const p = 1;`,
  });
  const scan = scanJsSource(dir);
  assert.equal(scan.lang, 'TypeScript/JavaScript');
  const svc = scan.files.find(f => f.module === 'pedido' && f.group === 'services');
  assert.ok(svc, 'arquivo em services/ deve ter group=services');
  // relativo ../integrations/gateway => inferido
  const rel = svc.imports.find(i => i.group === 'integrations');
  assert.equal(rel.name, 'gateway'); assert.equal(rel.prov, 'inferred');
  // alias @/models/pedido => exato
  const al = svc.imports.find(i => i.group === 'models');
  assert.equal(al.name, 'pedido'); assert.equal(al.prov, 'exact');
  // 'react' (bare) não vira import interno
  assert.equal(svc.imports.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanJsSource: require e import dinâmico também contam', () => {
  const dir = tmp({
    'api/rota.js': `const s = require('../services/pedido');\nconst m = () => import('@/repositorio/ordem');`,
    'services/pedido.js': `module.exports = {};`,
    'repositorio/ordem.js': `module.exports = {};`,
  });
  const scan = scanJsSource(dir);
  const api = scan.files.find(f => f.module === 'rota');
  assert.equal(api.group, 'api');
  assert.equal(findImp(scan, 'rota', 'services').name, 'pedido');   // require
  assert.equal(findImp(scan, 'rota', 'models').name, 'ordem');      // repositorio -> models; import()
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanGoSource: imports internos via go.mod (exato); stdlib ignorado', () => {
  const dir = tmp({
    'go.mod': `module example.com/proj\n\ngo 1.22\n`,
    'internal/service/pedido.go': `package service\n\nimport (\n\t"fmt"\n\t"example.com/proj/internal/integration/gateway"\n\t"example.com/proj/internal/repository/ordem"\n)\n\nfunc F() { fmt.Println(gateway.X, ordem.Y) }`,
    'internal/integration/gateway/g.go': `package gateway\n\nvar X = 1`,
    'internal/repository/ordem/o.go': `package ordem\n\nvar Y = 1`,
  });
  const scan = scanGoSource(dir);
  assert.equal(scan.lang, 'Go');
  const svc = scan.files.find(f => f.module === 'pedido');
  assert.equal(svc.group, 'services');                 // internal/ dropado, service -> services
  const gw = svc.imports.find(i => i.group === 'integrations');
  assert.equal(gw.name, 'gateway'); assert.equal(gw.prov, 'exact');
  const rep = svc.imports.find(i => i.group === 'models'); // repository -> models
  assert.equal(rep.name, 'ordem');
  // "fmt" (stdlib) não conta
  assert.equal(svc.imports.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanGoSource sem go.mod: não resolve imports (mas mapeia camadas)', () => {
  const dir = tmp({ 'service/pedido.go': `package service\n\nimport "example.com/x/integration/gw"\n` });
  const scan = scanGoSource(dir);
  const svc = scan.files.find(f => f.module === 'pedido');
  assert.equal(svc.group, 'services');
  assert.equal(svc.imports.length, 0); // sem go.mod, não dá p/ saber o que é interno
  fs.rmSync(dir, { recursive: true, force: true });
});
