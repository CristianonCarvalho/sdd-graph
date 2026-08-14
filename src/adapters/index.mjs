// Registry de adapters SDD + resolução/agregação.
// Fase 0 (docs/plano-sdd-graph.md B.3): só o adapter SpecKit. `resolveAdapters` já é
// plural para preparar a coexistência de múltiplos métodos no mesmo repo (B.9): quando
// houver mais de uma fonte, a agregação passa a namespacar os slugs como `fonte:slug`.
import fs from 'node:fs';
import speckit from './speckit.mjs';

export const ADAPTERS = [speckit];

/** Adapters aplicáveis. Com --adapter, filtra por nome; senão, os que detectam o projeto. */
export function resolveAdapters({ specsDir, adapter } = {}) {
  if (adapter) {
    const wanted = String(adapter).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const unknown = wanted.filter(w => !ADAPTERS.some(a => a.name === w));
    if (unknown.length) {
      throw new Error(`adapter(s) não suportado(s): ${unknown.join(', ')} (disponível: ${ADAPTERS.map(a => a.name).join(', ')})`);
    }
    return ADAPTERS.filter(a => wanted.includes(a.name));
  }
  return ADAPTERS.filter(a => a.detect(specsDir));
}

/**
 * Lê o projeto por todos os adapters aplicáveis e agrega as unidades no modelo canônico.
 * Fase 0: fonte única (SpecKit) → sem namespacing. Namespacing `fonte:slug` para
 * coexistência entra nas Fases 2–3 (B.9).
 */
export function parseProject({ specsDir, src, adapter } = {}) {
  const chosen = resolveAdapters({ specsDir, adapter });
  const out = {};
  for (const ad of chosen) {
    const units = ad.parse(specsDir, { src });
    for (const [slug, unit] of Object.entries(units)) out[slug] = unit;
  }
  if (!Object.keys(out).length) {
    if (specsDir && !fs.existsSync(specsDir)) throw new Error(`Diretório não encontrado: ${specsDir}`);
    throw new Error(`Nenhuma unidade SDD encontrada em ${specsDir}`);
  }
  return out;
}
