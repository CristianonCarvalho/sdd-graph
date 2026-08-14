// sdd-graph — Timeline: evolução do plano ao longo de N pontos (commits/snapshots).
// Puro e determinístico: dado o mesmo histórico, mesma saída. Reusa o diffReport
// para calcular o que mudou entre pontos consecutivos.
import { diffReport } from './diff.mjs';

/** Soma progresso (tasks) de todos os specs de um snapshot. */
function aggregateProgress(snap) {
  let total = 0, done = 0, doing = 0;
  const specs = (snap && snap.specs) || {};
  for (const s of Object.keys(specs)) {
    const p = specs[s].progress || { total: 0, done: 0, doing: 0 };
    total += p.total; done += p.done; doing += p.doing;
  }
  return { total, done, doing, pct: total ? Math.round(done / total * 100) : 0 };
}

/** Conta achados por severidade em todos os specs de um snapshot. */
function aggregateFindings(snap) {
  const c = { error: 0, warn: 0, info: 0 };
  const specs = (snap && snap.specs) || {};
  for (const s of Object.keys(specs)) {
    const f = specs[s].findings || {};
    for (const fp of Object.keys(f)) c[f[fp].severity] = (c[f[fp].severity] || 0) + 1;
  }
  return c;
}

/**
 * Monta a série temporal a partir de pontos ordenados (mais antigo → mais novo).
 * @param {Array<{label:string,date?:string,snapshot:object}>} points
 */
export function buildTimeline(points) {
  const pts = points.map((pt, i) => {
    const progress = aggregateProgress(pt.snapshot);
    const findings = aggregateFindings(pt.snapshot);
    let delta = null;
    if (i > 0) {
      const d = diffReport(points[i - 1].snapshot, pt.snapshot);
      delta = {
        completed: d.totals.completed,
        added: d.totals.tasksAdded,
        removed: d.totals.tasksRemoved,
        findingsAppeared: d.totals.findingsAppeared,
        findingsResolved: d.totals.findingsResolved,
      };
    }
    return { label: pt.label, date: pt.date || null, progress, findings, delta };
  });
  return { tool: 'sdd-graph', schemaVersion: 1, kind: 'timeline', points: pts };
}

const BLOCKS = '▁▂▃▄▅▆▇█';
/** Sparkline ASCII de uma lista de percentuais (0–100). */
export function sparkline(values) {
  if (!values.length) return '';
  return values.map(v => BLOCKS[Math.min(BLOCKS.length - 1, Math.round((Math.max(0, Math.min(100, v)) / 100) * (BLOCKS.length - 1)))]).join('');
}

/** Relatório da timeline em Markdown (tabela + tendência). Determinístico. */
export function timelineMarkdown(tl, opts = {}) {
  const proj = opts.project ? ` — ${opts.project}` : '';
  const L = ['### 📈 sdd-graph — timeline do plano' + proj, ''];
  const spark = sparkline(tl.points.map(p => p.progress.pct));
  if (spark) {
    const first = tl.points[0].progress.pct, last = tl.points[tl.points.length - 1].progress.pct;
    L.push(`Progresso: \`${spark}\`  ${first}% → ${last}%  (${tl.points.length} pontos)`, '');
  }
  L.push('| Ponto | Data | Progresso | Concluídas | Novas | Erros | Avisos |', '|---|---|--:|--:|--:|--:|--:|');
  for (const p of tl.points) {
    const d = p.delta;
    L.push(`| \`${p.label}\` | ${p.date || '—'} | ${p.progress.pct}% (${p.progress.done}/${p.progress.total}) | ${d ? (d.completed || '·') : '—'} | ${d ? (d.added || '·') : '—'} | ${p.findings.error} | ${p.findings.warn} |`);
  }
  // acumulado no período (soma dos deltas)
  const acc = tl.points.reduce((a, p) => {
    if (p.delta) { a.completed += p.delta.completed; a.added += p.delta.added; a.removed += p.delta.removed; a.fa += p.delta.findingsAppeared; a.fr += p.delta.findingsResolved; }
    return a;
  }, { completed: 0, added: 0, removed: 0, fa: 0, fr: 0 });
  L.push('', `No período: **${acc.completed} concluída(s)** · ${acc.added} nova(s) · ${acc.removed} removida(s) · achados +${acc.fa} / −${acc.fr}`);
  L.push('', '<sub>gerado por sdd-graph — determinístico</sub>');
  return L.join('\n');
}
