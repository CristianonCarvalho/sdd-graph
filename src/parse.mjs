// speckit-graph — parser de tasks.md do SpecKit para grafo (nós + arestas).
// Genérico: descobre todos os specs/*/tasks.md do projeto onde roda.
import fs from 'node:fs';
import path from 'node:path';

/** Extrai todas as dependências (ids Txxx) declaradas via "depende de ..." num rótulo. */
export function parseTaskDeps(label) {
  const deps = new Set();
  const re = /depende de ([^.)\n]*)/gi;      // pode haver mais de um trecho
  let m;
  while ((m = re.exec(label)) !== null) {
    const chunk = m[1];
    // ranges Txxx–Tyyy (en-dash, em-dash ou hífen)
    const rangeRe = /T(\d+)\s*[–—-]\s*T(\d+)/g;
    let r;
    while ((r = rangeRe.exec(chunk)) !== null) {
      const a = parseInt(r[1], 10), b = parseInt(r[2], 10);
      for (let i = a; i <= b; i++) deps.add('T' + String(i).padStart(3, '0'));
    }
    const consumed = chunk.replace(rangeRe, ' ');   // ids soltos restantes
    const idRe = /T(\d+)/g;
    let s;
    while ((s = idRe.exec(consumed)) !== null) {
      deps.add('T' + String(s[1]).padStart(3, '0'));
    }
  }
  return [...deps];
}

/** Faz o parse de um único tasks.md e retorna a lista de nós. */
export function parseTasksFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const nodes = [];
  let curPhase = null, curStory = null, curPriority = null, curPhaseIdx = 0;

  const phaseRe = /^##\s+Phase\s+(\d+):\s+(.+)$/;
  const storyRe = /User Story\s+(\d+)\s*-\s*(.+?)\s*\(Priority:\s*(P\d)\)/;
  const taskRe = /^-\s+\[( |X|x|~)\]\s+(T\d+)\s+(.*)$/;

  for (const line of lines) {
    const pm = line.match(phaseRe);
    if (pm) {
      curPhaseIdx = parseInt(pm[1], 10);
      const title = pm[2];
      const sm = title.match(storyRe);
      if (sm) {
        curStory = 'US' + sm[1];
        curPriority = sm[3];
        curPhase = title.replace(/\s*🎯.*$/, '').trim();
      } else {
        curStory = null;
        curPriority = /Foundational/i.test(title) ? 'FOUND'
                     : /Polish/i.test(title) ? 'POLISH'
                     : 'SETUP';
        curPhase = title.trim();
      }
      continue;
    }
    const tm = line.match(taskRe);
    if (tm) {
      const rest = tm[3];
      const parallel = /^\[P\]/.test(rest);
      let label = rest.replace(/^\[P\]\s*/, '').replace(/^\[US\d+\]\s*/, '');
      nodes.push({
        id: tm[2],
        label: label.trim(),
        phase: curPhase,
        phaseIdx: curPhaseIdx,
        story: curStory,
        priority: curPriority,
        done: tm[1].toLowerCase() === 'x',
        parallel,
        deps: parseTaskDeps(rest),
        frs: [...new Set(rest.match(/FR-\d+/g) || [])],
      });
    }
  }
  // remove deps que apontam para ids inexistentes (cross-spec / prosa)
  const ids = new Set(nodes.map(n => n.id));
  nodes.forEach(n => { n.deps = n.deps.filter(d => ids.has(d) && d !== n.id); });
  return nodes;
}

/** Faz o parse do spec.md: casos de uso (user stories) e texto dos FRs. */
export function parseSpecMd(specDir) {
  const f = path.join(specDir, 'spec.md');
  if (!fs.existsSync(f)) return { usecases: [], actors: [], frText: {} };
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const usecases = [], frText = {}, actors = new Set();
  const ucRe = /^###\s+User Story\s+(\d+)\s*-\s*(.+?)\s*\(Priority:\s*(P\d)\)/;
  const frRe = /^-\s+\*\*(FR-\d+[a-z]?)\*\*:\s*(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ucRe);
    if (m) {
      let body = '';
      for (let j = i + 1; j < lines.length && j < i + 6; j++) {
        const t = lines[j].trim();
        if (t) { body = t; break; }
      }
      const am = body.match(/^Como\s+([^,]+),/i);
      const actor = am ? am[1].trim() : 'Ator';
      actors.add(actor);
      usecases.push({ id: 'US' + m[1], title: m[2].trim(), priority: m[3], actor, desc: body });
      continue;
    }
    const fm = lines[i].match(frRe);
    if (fm) frText[fm[1]] = fm[2].trim();
  }
  return { usecases, actors: [...actors], frText };
}

/**
 * Deriva uma arquitetura (heurística) do plan.md + paths citados nas tasks.
 * Genérico: pastas src/<x> viram camadas; src/integrations/<y> vira adaptador
 * + sistema externo; Storage do plan.md vira datastore.
 */
export function buildArch(tasks, specDir) {
  const planFile = path.join(specDir, 'plan.md');
  const plan = fs.existsSync(planFile) ? fs.readFileSync(planFile, 'utf8') : '';
  const field = re => { const m = plan.match(re); return m ? m[1].trim() : ''; };
  const storage = field(/\*\*Storage\*\*:\s*([^\n(]+)/);
  const language = field(/\*\*Language\/Version\*\*:\s*([^\n]+)/);

  const top = {}; // dir top -> Set(subdirs)
  const pathRe = /src\/([a-zA-Z0-9_]+)(?:\/([a-zA-Z0-9_]+))?/g;
  tasks.forEach(t => {
    let m;
    while ((m = pathRe.exec(t.label)) !== null) {
      (top[m[1]] = top[m[1]] || new Set());
      if (m[2] && m[2] !== 'main') top[m[1]].add(m[2]);
    }
  });
  const has = k => !!top[k];
  const subs = k => (top[k] ? [...top[k]] : []);

  const nodes = [], links = [];
  const add = (id, label, kind, layer, items) => { nodes.push({ id, label, kind, layer, items: items || [] }); return id; };
  const link = (a, b) => { if (a && b) links.push([a, b]); };

  const actor = add('op', 'Operador', 'actor', 0);
  let prev = actor;
  if (has('web')) { const n = add('ui', 'Web UI', 'ui', 1, subs('web')); link(prev, n); prev = n; }
  if (has('api')) { const n = add('api', 'API', 'api', 2, subs('api')); link(prev, n); prev = n; }
  let svc = null;
  if (has('services')) { svc = add('svc', 'Serviços', 'service', 3, subs('services')); link(prev, svc); prev = svc; }
  const hub = svc || prev;
  if (has('config')) { const c = add('cfg', 'Config', 'config', 2, []); link(c, hub); }
  if (has('integrations')) {
    subs('integrations').forEach(name => {
      const a = add('int_' + name, name + ' adapter', 'integration', 4, []);
      link(hub, a);
      link(a, add('ext_' + name, name.toUpperCase(), 'external', 5, []));
    });
  }
  if (has('models') || has('db')) {
    const persist = add('data', 'Modelos + Persistência', 'model', 4, [...subs('models'), ...subs('db')]);
    link(hub, persist);
    if (storage) link(persist, add('store', storage.replace(/[.;].*$/, '').trim(), 'datastore', 5, []));
  }
  return { nodes, links, meta: { language, storage } };
}

/** Descobre e faz o parse de todos os specs/<slug>/ sob specsDir. */
export function parseSpecs(specsDir) {
  if (!fs.existsSync(specsDir)) {
    throw new Error(`Diretório de specs não encontrado: ${specsDir}`);
  }
  const out = {};
  for (const entry of fs.readdirSync(specsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(specsDir, entry.name);
    const tasksFile = path.join(dir, 'tasks.md');
    if (!fs.existsSync(tasksFile)) continue;
    const tasks = parseTasksFile(tasksFile);
    const spec = parseSpecMd(dir);
    out[entry.name] = {
      tasks,
      usecases: spec.usecases,
      actors: spec.actors,
      frText: spec.frText,
      arch: buildArch(tasks, dir),
    };
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`Nenhum tasks.md encontrado em ${specsDir}/*/tasks.md`);
  }
  return out;
}
