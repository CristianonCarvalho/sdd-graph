// speckit-graph — Índice de confiança (0–100): leitura honesta de "quanto
// confiar neste grafo". Puro e determinístico (só razões inteiras + pesos fixos).
//
// Dimensões medidas hoje (as que temos como aferir sem chutar):
//   task  — qualidade do parsing das tasks (linhas exatas vs. não casadas)
//   dep   — resolução das dependências (deps válidas vs. quebradas/auto)
//   arch  — derivação da arquitetura (lida do código vs. heurística; base ambígua)
// Dimensão ausente (ex.: projeto sem código) tem o peso redistribuído.

const WEIGHTS = { task: 0.40, dep: 0.35, arch: 0.25 };

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

  const terms = [['task', rTask], ['dep', rDep], ['arch', rArch]].filter(t => t[1] != null);
  if (!terms.length) return { index: null, dims: {} };

  const wsum = terms.reduce((a, [k]) => a + WEIGHTS[k], 0);
  const score = terms.reduce((a, [k, v]) => a + (WEIGHTS[k] / wsum) * v, 0) * 100;
  const dims = {};
  terms.forEach(([k, v]) => { dims[k] = Math.round(v * 100); });
  return { index: Math.round(score), dims };
}
