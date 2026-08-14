// sdd-graph — Diff/Timeline: compara duas versões do plano (base → atual).
// Puro e determinístico: mesmas entradas => mesmos bytes. Sem I/O, sem relógio.
// O CLI cuida de ler snapshots salvos ou materializar um git ref.
import { fingerprint } from './gate.mjs';

const RANK = { error: 0, warn: 1, info: 2 };

/**
 * Reduz a saída de parseSpecs() a um snapshot estável e comparável.
 * Guarda só o que muda entre versões: status/prioridade/deps/frs das tasks,
 * achados do Doctor (por fingerprint) e o progresso.
 */
export function buildSnapshot(data) {
  const specs = {};
  for (const slug of Object.keys(data).sort()) {
    const d = data[slug];
    const arr = d.tasks || [];
    const tasks = {};
    arr.forEach(t => {
      tasks[t.id] = {
        status: t.done ? 'done' : t.inProgress ? 'doing' : 'todo',
        priority: t.priority || null,
        story: t.story || null,
        deps: [...(t.deps || [])].sort(),
        frs: [...(t.frs || [])].sort(),
        label: t.label || '',
      };
    });
    const findings = {};
    ((d.diagnostics && d.diagnostics.findings) || []).forEach(f => {
      findings[fingerprint(slug, f)] = { id: f.id, severity: f.severity, targetKind: f.targetKind, targetId: f.targetId, message: f.message };
    });
    specs[slug] = {
      progress: { total: arr.length, done: arr.filter(t => t.done).length, doing: arr.filter(t => t.inProgress).length },
      tasks,
      findings,
    };
  }
  return { tool: 'sdd-graph', schemaVersion: 1, kind: 'snapshot', specs };
}

function sortFindings(list) {
  return list.sort((p, q) =>
    (RANK[p.severity] ?? 9) - (RANK[q.severity] ?? 9) ||
    (p.id < q.id ? -1 : p.id > q.id ? 1 : 0) ||
    (String(p.targetId) < String(q.targetId) ? -1 : String(p.targetId) > String(q.targetId) ? 1 : 0));
}

/**
 * Diff determinístico entre dois snapshots (from = base/antigo, to = atual/novo).
 * @returns estrutura com tasks (added/removed/statusChanged/…), findings e progresso.
 */
export function diffReport(from, to) {
  const F = (from && from.specs) || {}, T = (to && to.specs) || {};
  const slugs = [...new Set([...Object.keys(F), ...Object.keys(T)])].sort();
  const specs = {};
  const totals = { tasksAdded: 0, tasksRemoved: 0, statusChanged: 0, completed: 0, findingsAppeared: 0, findingsResolved: 0 };
  const specsAdded = [], specsRemoved = [];

  for (const slug of slugs) {
    const a = F[slug], b = T[slug];
    if (a && !b) specsRemoved.push(slug);
    if (!a && b) specsAdded.push(slug);

    const at = (a && a.tasks) || {}, bt = (b && b.tasks) || {};
    const ids = [...new Set([...Object.keys(at), ...Object.keys(bt)])].sort();
    const added = [], removed = [], statusChanged = [], priorityChanged = [], depsChanged = [], completed = [];
    for (const id of ids) {
      const x = at[id], y = bt[id];
      if (!x && y) added.push({ id, status: y.status, priority: y.priority, label: y.label });
      else if (x && !y) removed.push({ id, status: x.status, priority: x.priority, label: x.label });
      else if (x && y) {
        if (x.status !== y.status) {
          const rec = { id, from: x.status, to: y.status, label: y.label };
          statusChanged.push(rec);
          if (y.status === 'done' && x.status !== 'done') completed.push(rec);
        }
        if (x.priority !== y.priority) priorityChanged.push({ id, from: x.priority, to: y.priority, label: y.label });
        const da = y.deps.filter(d => !x.deps.includes(d)), dr = x.deps.filter(d => !y.deps.includes(d));
        if (da.length || dr.length) depsChanged.push({ id, added: da, removed: dr, label: y.label });
      }
    }

    const af = (a && a.findings) || {}, bf = (b && b.findings) || {};
    const appeared = sortFindings(Object.keys(bf).filter(k => !af[k]).map(k => bf[k]));
    const resolved = sortFindings(Object.keys(af).filter(k => !bf[k]).map(k => af[k]));

    const pa = (a && a.progress) || { total: 0, done: 0, doing: 0 };
    const pb = (b && b.progress) || { total: 0, done: 0, doing: 0 };
    const changed = added.length || removed.length || statusChanged.length || priorityChanged.length || depsChanged.length || appeared.length || resolved.length;
    specs[slug] = {
      status: a && !b ? 'removed' : !a && b ? 'added' : (changed ? 'changed' : 'unchanged'),
      tasks: { added, removed, statusChanged, priorityChanged, depsChanged, completed },
      findings: { appeared, resolved },
      progress: { from: pa, to: pb, doneDelta: pb.done - pa.done, totalDelta: pb.total - pa.total },
    };
    totals.tasksAdded += added.length; totals.tasksRemoved += removed.length;
    totals.statusChanged += statusChanged.length; totals.completed += completed.length;
    totals.findingsAppeared += appeared.length; totals.findingsResolved += resolved.length;
  }
  return { tool: 'sdd-graph', schemaVersion: 1, kind: 'diff', totals, specsAdded, specsRemoved, specs };
}

const pct = (d, t) => t ? Math.round(d / t * 100) : 0;

/** Relatório de diff em Markdown (para PR/issue/ata). Determinístico. */
export function diffMarkdown(rep, opts = {}) {
  const proj = opts.project ? ` — ${opts.project}` : '';
  const t = rep.totals;
  const L = ['### 🕒 sdd-graph — diff do plano' + proj,
    `**${t.completed} concluída(s)** desde a base · ${t.tasksAdded} nova(s) · ${t.tasksRemoved} removida(s) · achados: +${t.findingsAppeared} / −${t.findingsResolved}`, ''];
  const anyChange = Object.keys(rep.specs).some(s => rep.specs[s].status !== 'unchanged');
  if (!anyChange) { L.push('_Sem mudanças em relação à base._'); return L.join('\n'); }

  for (const slug of Object.keys(rep.specs)) {
    const s = rep.specs[slug];
    if (s.status === 'unchanged') continue;
    const tag = s.status === 'added' ? ' 🆕 (novo spec)' : s.status === 'removed' ? ' 🗑️ (removido)' : '';
    L.push(`#### ${slug}${tag}`);
    const p = s.progress;
    const deltaTxt = p.doneDelta ? `, ${p.doneDelta > 0 ? '+' : ''}${p.doneDelta} concluída(s)` : '';
    L.push(`Progresso: ${pct(p.from.done, p.from.total)}% → ${pct(p.to.done, p.to.total)}% (${p.to.done}/${p.to.total}${deltaTxt})`);
    const tk = s.tasks;
    if (tk.completed.length) L.push(`✅ Concluídas: ${tk.completed.map(x => x.id).join(', ')}`);
    if (tk.added.length) L.push(`➕ Novas: ${tk.added.map(x => `${x.id}${x.priority ? ` (${x.priority})` : ''}`).join(', ')}`);
    if (tk.removed.length) L.push(`➖ Removidas: ${tk.removed.map(x => x.id).join(', ')}`);
    const otherStatus = tk.statusChanged.filter(x => !(x.to === 'done' && x.from !== 'done'));
    if (otherStatus.length) L.push(`🔄 Status: ${otherStatus.map(x => `${x.id} ${x.from}→${x.to}`).join(', ')}`);
    if (tk.priorityChanged.length) L.push(`🎯 Prioridade: ${tk.priorityChanged.map(x => `${x.id} ${x.from || '—'}→${x.to || '—'}`).join(', ')}`);
    if (tk.depsChanged.length) L.push(`🔗 Dependências: ${tk.depsChanged.map(x => `${x.id} (${x.added.map(d => '+' + d).concat(x.removed.map(d => '−' + d)).join(' ')})`).join('; ')}`);
    if (s.findings.appeared.length) L.push(`⚠️ Achados novos: ${s.findings.appeared.map(f => `[${f.id}] ${f.targetId}`).join(', ')}`);
    if (s.findings.resolved.length) L.push(`✔️ Achados resolvidos: ${s.findings.resolved.map(f => `[${f.id}] ${f.targetId}`).join(', ')}`);
    L.push('');
  }
  L.push('<sub>gerado por sdd-graph — determinístico</sub>');
  return L.join('\n');
}
