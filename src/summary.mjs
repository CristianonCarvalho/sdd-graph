// speckit-graph — resumo textual (Markdown) determinístico do plano.
// Para colar em PR / issue / ata sem abrir o HTML. Puro, sem I/O.

function graphInfo(tasks) {
  const ids = new Set(tasks.map(t => t.id));
  const downstream = new Map(tasks.map(t => [t.id, []]));
  tasks.forEach(t => (t.deps || []).forEach(d => { if (ids.has(d)) downstream.get(d).push(t.id); }));
  const memo = new Map();
  const desc = (id, seen) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return new Set();
    seen.add(id);
    const s = new Set();
    (downstream.get(id) || []).forEach(c => { s.add(c); desc(c, seen).forEach(x => s.add(x)); });
    memo.set(id, s); return s;
  };
  const blocks = new Map();
  tasks.forEach(t => blocks.set(t.id, desc(t.id, new Set()).size));

  const adj = new Map(tasks.map(t => [t.id, (t.deps || []).filter(d => ids.has(d))]));
  const pl = new Map();
  const PL = (id, seen) => {
    if (pl.has(id)) return pl.get(id);
    if (seen.has(id)) return { len: 0, next: null };
    seen.add(id);
    let best = { len: 0, next: null };
    (adj.get(id) || []).slice().sort().forEach(d => { const r = PL(d, seen); if (r.len > best.len) best = { len: r.len, next: d }; });
    const res = { len: best.len + 1, next: best.next }; pl.set(id, res); return res;
  };
  let start = null, bl = 0;
  [...tasks].sort((a, b) => a.id < b.id ? -1 : 1).forEach(t => { const r = PL(t.id, new Set()); if (r.len > bl) { bl = r.len; start = t.id; } });
  const critPath = []; let cur = start; const guard = new Set();
  while (cur && !guard.has(cur)) { guard.add(cur); critPath.push(cur); cur = pl.get(cur).next; }
  critPath.reverse(); // fundação -> feature
  return { critPath, blocks };
}

export function buildSummary(data, project) {
  const L = [`# speckit-graph — ${project}`, ''];
  for (const slug of Object.keys(data).sort()) {
    const d = data[slug];
    const tasks = d.tasks || [];
    const total = tasks.length, done = tasks.filter(t => t.done).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    L.push(`## ${slug}`, '');

    L.push('### Progresso', `- Total: ${total} tasks · Concluídas: ${done} (${pct}%)`);
    const byp = {};
    tasks.forEach(t => { (byp[t.priority] = byp[t.priority] || { d: 0, t: 0 }); byp[t.priority].t++; if (t.done) byp[t.priority].d++; });
    L.push('- Por prioridade: ' + Object.keys(byp).sort().map(k => `${k} ${byp[k].d}/${byp[k].t}`).join(' · '), '');

    const { critPath, blocks } = graphInfo(tasks);
    L.push(`### Caminho crítico (${critPath.length} tasks)`, critPath.length ? '`' + critPath.join(' → ') + '`' : '—', '');

    const top = tasks.map(t => ({ id: t.id, b: blocks.get(t.id) || 0 }))
      .filter(x => x.b > 0).sort((a, b) => b.b - a.b || (a.id < b.id ? -1 : 1)).slice(0, 5);
    L.push('### Gargalos (mais bloqueantes)');
    L.push(top.length ? top.map((x, i) => `${i + 1}. ${x.id} — bloqueia ${x.b} task(s)`).join('\n') : '—', '');

    const doneSet = new Set(tasks.filter(t => t.done).map(t => t.id));
    const nxt = tasks.filter(t => !t.done && (t.deps || []).every(dep => doneSet.has(dep)));
    L.push('### Próximas desbloqueáveis');
    L.push(nxt.length ? nxt.slice(0, 10).map(t => `- [ ] ${t.id} — ${t.label}`).join('\n') : '—', '');

    const diag = d.diagnostics || { counts: { error: 0, warn: 0, info: 0 }, findings: [] };
    L.push('### Doctor', `- ${diag.counts.error} erro(s), ${diag.counts.warn} aviso(s), ${diag.counts.info} info`);
    diag.findings.filter(f => f.severity === 'error').forEach(f => L.push(`  - ❌ [${f.id}] ${f.message}`));
    L.push('');

    const ci = d.confidence && d.confidence.index != null ? d.confidence.index + '%' : '—';
    L.push(`_Confiança do relatório: ${ci}_`, '');
  }
  return L.join('\n');
}
