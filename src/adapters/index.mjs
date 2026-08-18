// Registry de adapters SDD + resolução/agregação.
// Fase 0 (docs/plano-sdd-graph.md B.3): só o adapter SpecKit. `resolveAdapters` já é
// plural para preparar a coexistência de múltiplos métodos no mesmo repo (B.9): quando
// houver mais de uma fonte, a agregação passa a namespacar os slugs como `fonte:slug`.
import fs from 'node:fs';
import speckit from './speckit.mjs';
import reversa from './reversa.mjs';
import tlc from './tlc.mjs';

export const ADAPTERS = [speckit, reversa, tlc];

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
 * Fonte única (caso comum) → slugs sem prefixo, comportamento idêntico ao de antes.
 * Mais de uma fonte detectada (coexistência, B.9) → namespacing `fonte:slug`, para não
 * colidir ids/permalink/fingerprint entre unidades de adapters diferentes.
 */
export function parseProject({ specsDir, src, adapter } = {}) {
  const chosen = resolveAdapters({ specsDir, adapter });
  const namespaced = chosen.length > 1;
  const out = {};
  for (const ad of chosen) {
    const units = ad.parse(specsDir, { src });
    for (const [slug, unit] of Object.entries(units)) out[namespaced ? `${ad.name}:${slug}` : slug] = unit;
  }
  if (!Object.keys(out).length) {
    // Nada detectado: pede a cada adapter uma dica do que viu (ex.: achou artefatos de um
    // modo que ele ainda não sabe ler) — mensagem genérica de "specs não encontrado" some
    // enganosa quando o projeto usa uma fonte diferente do SpecKit.
    const hints = ADAPTERS.map(a => (typeof a.hint === 'function' ? a.hint(specsDir) : null)).filter(Boolean);
    if (hints.length) throw new Error(`Nenhuma unidade SDD encontrada em ${specsDir}. ${hints.join(' ')}`);
    if (specsDir && !fs.existsSync(specsDir)) throw new Error(`Diretório não encontrado: ${specsDir}`);
    throw new Error(`Nenhuma unidade SDD encontrada em ${specsDir}`);
  }
  return out;
}
