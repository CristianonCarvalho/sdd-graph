// speckit-graph — Doctor: diagnóstico determinístico do plano SpecKit.
// Função pura: mesmas entradas => mesmas saídas (ordenadas por severidade/id).
// Não lê arquivos, não usa rede/relógio. Consumido pelo CLI (--doctor), pelo
// gate de CI (--check) e, futuramente, pela sobreposição visual no HTML.

const SEV = { error: 0, warn: 1, info: 2 };

/** Tarjan iterativo (sem recursão profunda): componentes fortemente conexos. */
function tarjanSCC(ids, adj) {
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], sccs = [];
  for (const start of ids) {
    if (idx.has(start)) continue;
    const work = [[start, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const v = frame[0];
      if (frame[1] === 0) { idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v); }
      const succ = (adj.get(v) || []);
      if (frame[1] < succ.length) {
        const w = succ[frame[1]++];
        if (!idx.has(w)) work.push([w, 0]);
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
      } else {
        if (low.get(v) === idx.get(v)) {
          const comp = []; let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
          if (comp.length > 1) sccs.push(comp.sort());
          else if ((adj.get(v) || []).includes(v)) sccs.push([v]); // auto-ciclo
        }
        work.pop();
        if (work.length) { const p = work[work.length - 1][0]; low.set(p, Math.min(low.get(p), low.get(v))); }
      }
    }
  }
  return sccs;
}

/** Extrai um ciclo concreto dentro de um conjunto fortemente conexo S. */
function extractCycle(S, adj) {
  const inS = new Set(S);
  const start = S[0];
  const path = [], seen = new Set();
  let cur = start;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur); path.push(cur);
    const next = (adj.get(cur) || []).filter(x => inS.has(x)).sort();
    cur = next[0];
  }
  if (cur == null) return S.concat(S[0]); // fallback
  const i = path.indexOf(cur);
  return path.slice(i).concat(cur); // ex.: [T020, T023, T020]
}

/**
 * Roda o Doctor sobre um spec já parseado.
 * @param {{tasks,usecases,frText,arch}} spec
 * @returns {{findings: Array, counts: {error,warn,info}}}
 */
export function runDoctor(spec) {
  const tasks = spec.tasks || [];
  const frText = spec.frText || {};
  const usecases = spec.usecases || [];
  const arch = spec.arch || { nodes: [] };
  const findings = [];
  const add = (id, severity, targetKind, targetId, message, confidence = 'exata') =>
    findings.push({ id, severity, targetKind, targetId, message, confidence });

  const ids = new Set(tasks.map(t => t.id));

  // DUP_TASK_ID (error)
  const count = {};
  tasks.forEach(t => { count[t.id] = (count[t.id] || 0) + 1; });
  Object.keys(count).filter(id => count[id] > 1).sort().forEach(id =>
    add('DUP_TASK_ID', 'error', 'task', id, `ID de task repetido ${count[id]}× (${id}).`));

  // SELF_DEP / DEP_UNKNOWN (error) — usa deps cruas (antes da filtragem)
  tasks.forEach(t => {
    [...new Set(t.depsRaw || t.deps || [])].sort().forEach(d => {
      if (d === t.id) add('SELF_DEP', 'error', 'task', t.id, `${t.id} depende de si mesma.`);
      else if (!ids.has(d)) add('DEP_UNKNOWN', 'error', 'task', t.id, `${t.id} depende de ${d}, que não existe.`);
    });
  });

  // CYCLE (error) — SCC no grafo de dependências (deps válidas)
  const adj = new Map(tasks.map(t => [t.id, []]));
  tasks.forEach(t => (t.deps || []).forEach(d => { if (adj.has(d)) adj.get(t.id).push(d); }));
  adj.forEach((v, k) => adj.set(k, [...new Set(v)].sort()));
  const sortedIds = [...ids].sort();
  tarjanSCC(sortedIds, adj).forEach(S => {
    const cyc = extractCycle(S, adj);
    const brk = cyc.length >= 2 ? `${cyc[cyc.length - 2]} → ${cyc[cyc.length - 1]}` : cyc[0];
    add('CYCLE', 'error', 'task', S[0],
      `Ciclo de dependência: ${cyc.join(' → ')}. Quebre a aresta ${brk} para tornar acíclico.`);
  });

  // TASK_NO_PRIORITY (warn)
  tasks.forEach(t => { if (!t.priority) add('TASK_NO_PRIORITY', 'warn', 'task', t.id, `${t.id} sem prioridade.`); });

  // TASK_NO_STORY (warn) — task de prioridade P* sem user story vinculada
  tasks.forEach(t => {
    if (/^P\d$/.test(t.priority || '') && !t.story)
      add('TASK_NO_STORY', 'warn', 'task', t.id, `${t.id} (${t.priority}) sem user story vinculada.`);
  });

  // FR_ORPHAN (warn) — FR do spec.md que nenhuma task implementa
  const frInTasks = new Set();
  tasks.forEach(t => (t.frs || []).forEach(f => frInTasks.add(f)));
  Object.keys(frText).sort().forEach(fr => {
    if (!frInTasks.has(fr)) add('FR_ORPHAN', 'warn', 'fr', fr, `${fr} não é citado por nenhuma task.`);
  });

  // STORY_NO_FR (warn) — user story cujas tasks não citam nenhum FR
  usecases.forEach(u => {
    const ts = tasks.filter(t => t.story === u.id);
    const anyFR = ts.some(t => (t.frs || []).length > 0);
    if (!anyFR) add('STORY_NO_FR', 'warn', 'story', u.id, `${u.id} (${u.title}) sem nenhum requisito (FR) vinculado.`);
  });

  // CODE_ORPHAN (info, heurístico) — módulo de serviço lido do código sem task que o cite
  if (arch.source) {
    const taskText = tasks.map(t => (t.label || '').toLowerCase()).join(' \n ');
    arch.nodes.filter(n => n.kind === 'service').forEach(n => {
      const mod = (n.label || '').toLowerCase();
      if (mod && !taskText.includes(mod))
        add('CODE_ORPHAN', 'info', 'module', n.id, `Módulo '${n.label}' existe no código, mas nenhuma task o referencia.`, 'baixa');
    });
  }

  // ordenação canônica: severidade, depois id da regra, depois alvo
  findings.sort((a, b) =>
    (SEV[a.severity] - SEV[b.severity]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) ||
    (String(a.targetId) < String(b.targetId) ? -1 : String(a.targetId) > String(b.targetId) ? 1 : 0));

  const counts = { error: 0, warn: 0, info: 0 };
  findings.forEach(f => counts[f.severity]++);
  return { findings, counts };
}
