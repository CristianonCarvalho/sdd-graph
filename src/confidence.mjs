// sdd-graph — Índice de confiança (0–100): leitura honesta de "quanto
// confiar neste grafo". Puro e determinístico (só razões inteiras + pesos fixos).
//
// Dimensões medidas hoje (as que temos como aferir sem chutar):
//   task   — qualidade do parsing das tasks (linhas exatas vs. não casadas)
//   dep    — resolução das dependências (deps válidas vs. quebradas/auto)
//   arch   — derivação da arquitetura (lida do código vs. heurística; base ambígua)
//   import — resolução dos imports do código (exato vs. inferido/relativo vs. não resolvido)
// Dimensão ausente (ex.: projeto sem código) tem o peso redistribuído.

const WEIGHTS = { task: 0.35, dep: 0.30, arch: 0.20, import: 0.15 };

function ratio(good, bad) {
  const total = good + bad;
  return total > 0 ? good / total : null; // null = dimensão não aplicável
}

/**
 * @param {object} p provenance: { taskLines:{exact,unmatched}, depEdges:{resolved,unresolved}, arch:{source,baseAmbiguous} }
 * @returns {{index:number|null, dims:object}}
 */
export function computeConfidence(p) {
  const rTask = p.taskLines ? ratio(p.taskLines.exact, p.taskLines.unmatched) : null;
  const rDep = p.depEdges ? ratio(p.depEdges.resolved, p.depEdges.unresolved) : null;
  let rArch = null;
  if (p.arch) rArch = p.arch.source ? (p.arch.baseAmbiguous ? 0.75 : 1) : 0.5;
  // inferido (import relativo resolvido) vale crédito parcial; não-resolvido conta contra
  let rImport = null;
  if (p.imports) { const ie = p.imports, tot = ie.exact + ie.inferred + ie.unresolved; if (tot > 0) rImport = (ie.exact + 0.7 * ie.inferred) / tot; }

  const terms = [['task', rTask], ['dep', rDep], ['arch', rArch], ['import', rImport]].filter(t => t[1] != null);
  if (!terms.length) return { index: null, dims: {} };

  const wsum = terms.reduce((a, [k]) => a + WEIGHTS[k], 0);
  const score = terms.reduce((a, [k, v]) => a + (WEIGHTS[k] / wsum) * v, 0) * 100;
  const dims = {};
  terms.forEach(([k, v]) => { dims[k] = Math.round(v * 100); });
  return { index: Math.round(score), dims };
}
