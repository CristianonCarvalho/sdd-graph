// Adapter SpecKit — lê specs/<slug>/{tasks,spec,plan}.md e devolve as unidades no modelo
// canônico. Fase 0 do plano (docs/plano-sdd-graph.md B.4): encapsula o parser atual
// (src/parse.mjs) atrás da interface de adapter, SEM mudar comportamento.
import fs from 'node:fs';
import path from 'node:path';
import { parseSpecs } from '../parse.mjs';

/** Confiança 0..1 de que specsDir é um projeto SpecKit (algum <slug>/tasks.md). */
function detect(specsDir) {
  if (!specsDir || !fs.existsSync(specsDir)) return 0;
  try {
    for (const e of fs.readdirSync(specsDir, { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(specsDir, e.name, 'tasks.md'))) return 1;
    }
  } catch { /* ignora */ }
  return 0;
}

/** Lê e normaliza → { slug: Unit }. Cada unidade recebe source:'speckit'
 *  (o adapter que a produziu — NÃO confundir com unit.arch.source, que é o booleano
 *  "arquitetura lida do código"). */
function parse(specsDir, opts = {}) {
  const units = parseSpecs(specsDir, opts);
  for (const slug of Object.keys(units)) units[slug].source = 'speckit';
  return units;
}

export default {
  name: 'speckit',
  label: 'SpecKit',
  detect,
  parse,
  capabilities: { deps: true, stories: true, requirements: 'FR', architecture: 'from-code' },
};
