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
 * @param {object} p provenance: { taskLines:{exact,unmatched}, depEdges:{resolved,unresolved,inferred?}, arch:{source,baseAmbiguous} }
 *   depEdges.inferred (opcional): quantas das `resolved` são inferidas (não declaradas
 *   pela fonte — ver src/parse.mjs). Pré-condição do chamador: inferred <= resolved.
 * @returns {{index:number|null, dims:object}}
 */
export function computeConfidence(p) {
  const rTask = p.taskLines ? ratio(p.taskLines.exact, p.taskLines.unmatched) : null;
  // dep: aresta declarada pela fonte vale cheio; inferida (fase/[P], sem anotação inline —
  // ver src/parse.mjs) vale crédito parcial (0.7), mesmo tratamento dos imports relativos
  // abaixo. Quando `inferred` está ausente/0 (todo o resto do código hoje), reduz à mesma
  // ratio() de sempre — retrocompatível.
  let rDep = null;
  if (p.depEdges) {
    const { resolved = 0, unresolved = 0, inferred = 0 } = p.depEdges;
    const inf = Math.min(Math.max(inferred, 0), resolved); // defensivo: nunca > resolved
    const total = resolved + unresolved;
    if (total > 0) rDep = ((resolved - inf) + 0.7 * inf) / total;
  }
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
