import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, timelineMarkdown, sparkline } from '../src/timeline.mjs';

// snapshots sintéticos: o progresso sobe 0% → 50% → 100%
const snap = (tasks, findings = {}) => ({ kind: 'snapshot', specs: { '001': { progress: prog(tasks), tasks, findings } } });
function prog(tasks) {
  const arr = Object.values(tasks);
  return { total: arr.length, done: arr.filter(t => t.status === 'done').length, doing: arr.filter(t => t.status === 'doing').length };
}
const T = (status, extra = {}) => ({ status, priority: 'P1', story: 'US1', deps: [], frs: [], label: 'x', ...extra });

const p0 = snap({ T001: T('todo'), T002: T('todo') });
const p1 = snap({ T001: T('done'), T002: T('doing') }, { ff: { id: 'CYCLE', severity: 'error', targetKind: 'task', targetId: 'T002', message: 'c' } });
const p2 = snap({ T001: T('done'), T002: T('done'), T003: T('todo') });

const points = [
  { label: 'c0', date: '2026-08-01', snapshot: p0 },
  { label: 'c1', date: '2026-08-05', snapshot: p1 },
  { label: 'atual', date: null, snapshot: p2 },
];

test('buildTimeline: progresso agregado e deltas entre pontos', () => {
  const tl = buildTimeline(points);
  assert.equal(tl.points.length, 3);
  assert.equal(tl.points[0].progress.pct, 0);
  assert.equal(tl.points[1].progress.pct, 50);   // 1 de 2
  assert.equal(tl.points[2].progress.pct, 67);   // 2 de 3 (arredonda)
  assert.equal(tl.points[0].delta, null);        // primeiro ponto não tem delta
  assert.equal(tl.points[1].delta.completed, 1); // T001 concluída
  assert.equal(tl.points[2].delta.completed, 1); // T002 concluída
  assert.equal(tl.points[2].delta.added, 1);     // T003 nova
  // achados agregados por ponto
  assert.equal(tl.points[1].findings.error, 1);
  assert.equal(tl.points[2].findings.error, 0);  // ciclo resolvido
  assert.equal(tl.points[2].delta.findingsResolved, 1);
});

test('buildTimeline é determinístico', () => {
  assert.equal(JSON.stringify(buildTimeline(points)), JSON.stringify(buildTimeline(points)));
});

test('sparkline mapeia percentuais para blocos', () => {
  assert.equal(sparkline([0, 100]), '▁█');
  assert.equal(sparkline([]).length, 0);
  assert.equal(sparkline([0, 50, 100]).length, 3);
});

test('timelineMarkdown: tabela, sparkline e acumulado', () => {
  const md = timelineMarkdown(buildTimeline(points), { project: 'proj' });
  assert.match(md, /timeline do plano — proj/);
  assert.match(md, /Progresso: `.+`  0% → 67%/);
  assert.match(md, /\| Ponto \| Data \| Progresso/);
  assert.match(md, /No período: \*\*2 concluída\(s\)\*\*/); // 1 + 1
});
