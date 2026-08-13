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

/** Descobre e faz o parse de todos os specs/<slug>/tasks.md sob specsDir. */
export function parseSpecs(specsDir) {
  if (!fs.existsSync(specsDir)) {
    throw new Error(`Diretório de specs não encontrado: ${specsDir}`);
  }
  const out = {};
  for (const entry of fs.readdirSync(specsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tasksFile = path.join(specsDir, entry.name, 'tasks.md');
    if (fs.existsSync(tasksFile)) out[entry.name] = parseTasksFile(tasksFile);
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`Nenhum tasks.md encontrado em ${specsDir}/*/tasks.md`);
  }
  return out;
}
