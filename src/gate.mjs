// sdd-graph — CI Gate: transforma o diagnóstico do Doctor em relatório JSON
// determinístico + veredito (passou/falhou) para uso em pipeline.
// Puro: sem I/O, sem relógio/rede. O CLI cuida de ler/gravar arquivos.

/** FNV-1a 32-bit (não-cripto, embutido) — para fingerprint estável de finding. */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Chave estável de um achado (inclui o slug para não colidir entre specs). */
export function fingerprint(slug, f) {
  return fnv1a(`${slug}|${f.id}|${f.targetKind}|${f.targetId}`);
}

/** Métricas de grafo do DAG de tasks (determinísticas). */
function graphMetrics(tasks, diag) {
  const ids = new Set(tasks.map(t => t.id));
  const edges = tasks.reduce((a, t) => a + (t.deps || []).filter(d => ids.has(d)).length, 0);
  const cyclic = diag.findings.some(f => f.id === 'CYCLE');
  let criticalPathLength = null;
  if (!cyclic) {
    const memo = new Map();
    const adj = new Map(tasks.map(t => [t.id, (t.deps || []).filter(d => ids.has(d))]));
    const L = (id, seen) => {
      if (memo.has(id)) return memo.get(id);
      if (seen.has(id)) return 0;
      seen.add(id);
      let m = 0; (adj.get(id) || []).forEach(d => { m = Math.max(m, L(d, seen)); });
      memo.set(id, m + 1); return m + 1;
    };
    tasks.forEach(t => L(t.id, new Set()));
    criticalPathLength = memo.size ? Math.max(...memo.values()) : 0;
  }
  return { nodes: tasks.length, edges, cyclic, criticalPathLength };
}

/**
 * Monta o relatório do gate.
 * @param {object} data  saída de parseSpecs() (cada spec já tem .diagnostics)
 * @param {object} opts  { gate: string[] (severidades que reprovam), baseline: Set<fingerprint> }
 * @returns {{report, passed, fingerprints: Set<string>}}
 */
export function buildGateReport(data, opts = {}) {
  const gate = opts.gate && opts.gate.length ? opts.gate : ['error'];
  const baseline = opts.baseline || new Set();
  const useBaseline = baseline.size > 0;
  const specs = {};
  const agg = { error: 0, warn: 0, info: 0 };
  const fingerprints = new Set();
  const stillPresent = new Set();
  let violations = 0;
  let minConfidence = null;

  for (const slug of Object.keys(data).sort()) {
    const d = data[slug];
    const diag = d.diagnostics || { findings: [], counts: { error: 0, warn: 0, info: 0 } };
    const findings = diag.findings.map(f => {
      const fp = fingerprint(slug, f);
      fingerprints.add(fp); stillPresent.add(fp);
      const isNew = useBaseline ? !baseline.has(fp) : undefined;
      if (gate.includes(f.severity) && (!useBaseline || isNew)) violations++;
      return { ...f, fingerprint: fp, ...(useBaseline ? { isNew } : {}) };
    });
    agg.error += diag.counts.error; agg.warn += diag.counts.warn; agg.info += diag.counts.info;
    const conf = d.confidence ? d.confidence.index : null;
    if (conf != null) minConfidence = minConfidence == null ? conf : Math.min(minConfidence, conf);
    specs[slug] = { summary: diag.counts, confidenceIndex: conf, graph: graphMetrics(d.tasks || [], diag), findings };
  }
  agg.confidenceIndex = minConfidence;

  const resolved = [...baseline].filter(fp => !stillPresent.has(fp)).sort();
  const passed = violations === 0;
  const report = {
    schemaVersion: 1,
    tool: 'sdd-graph',
    summary: agg,
    gate: {
      levels: gate,
      passed,
      violations,
      baseline: { used: useBaseline, resolved },
    },
    specs,
  };
  return { report, passed, fingerprints };
}

/** Link de um achado para a visão exata do HTML (usa o permalink #hash). */
function findingLink(f, baseUrl) {
  if (!baseUrl) return '';
  let hash = '';
  if (f.targetKind === 'task') hash = `#tab=deps&sel=${f.targetId}`;
  else if (f.targetKind === 'fr') hash = `#tab=usecases&sel=fr_${f.targetId}`;
  else if (f.targetKind === 'story') hash = `#tab=usecases&sel=${f.targetId}`;
  else if (f.targetKind === 'module') hash = `#tab=arch&sel=${f.targetId}`;
  return `[ver](${baseUrl}${hash})`;
}

/** Relatório em Markdown para postar como comentário de PR (idempotente via marcador). */
export function gateMarkdown(report, opts = {}) {
  const base = opts.baseUrl || '';
  const s = report.summary;
  const L = ['<!-- sdd-graph -->', '### 🔎 sdd-graph — gate do plano',
    `**${report.gate.passed ? '✅ passou' : '❌ reprovou'}** — ${s.error} erro(s), ${s.warn} aviso(s), ${s.info} info · confiança ${s.confidenceIndex != null ? s.confidenceIndex + '%' : '—'}`, ''];
  for (const slug of Object.keys(report.specs)) {
    const sp = report.specs[slug];
    L.push(`#### ${slug} — ${sp.summary.error} erro(s), ${sp.summary.warn} aviso(s)${sp.confidenceIndex != null ? ` · confiança ${sp.confidenceIndex}%` : ''}`);
    const shown = sp.findings.filter(f => f.severity !== 'info').slice(0, 20);
    if (shown.length) {
      L.push('| Sev | Achado | |', '|:--:|---|--|');
      shown.forEach(f => L.push(`| ${f.severity === 'error' ? '❌' : '⚠️'} | \`[${f.id}]\` ${String(f.message).replace(/\|/g, '\\|')} | ${findingLink(f, base)} |`));
      const rest = sp.findings.filter(f => f.severity !== 'info').length - shown.length;
      if (rest > 0) L.push(`| | _+ ${rest} outro(s)_ | |`);
    } else L.push('_sem erros/avisos_ ✓');
    L.push('', `Grafo: ${sp.graph.nodes} tasks · ${sp.graph.edges} deps · caminho crítico ${sp.graph.criticalPathLength ?? '—'}`, '');
  }
  L.push('<sub>gerado por sdd-graph — determinístico</sub>');
  return L.join('\n');
}

/** Serialização canônica (chaves ordenadas) — mesma entrada => mesmos bytes. */
export function stringifyCanonical(obj) {
  const canon = o => Array.isArray(o) ? o.map(canon)
    : (o && typeof o === 'object'
      ? Object.keys(o).sort().reduce((r, k) => (r[k] = canon(o[k]), r), {})
      : o);
  return JSON.stringify(canon(obj), null, 2);
}
