// Adapter Reversa (sandeco/reversa) — pipeline FORWARD: lê _reversa_forward/<slug>/
// {actions.md, requirements.md} e devolve unidades no modelo canônico.
//
// Formato confirmado contra os templates REAIS do projeto fonte (não a descrição solta
// da doc — aprendemos com o BMad que isso pode estar desatualizado):
//   templates/forward/body/actions-template.md
//   templates/forward/body/requirements-template.md
//   em github.com/sandeco/reversa (buscado e citado verbatim em docs/plano-sdd-graph.md).
//
// Escopo desta primeira versão: só o pipeline FORWARD (tasks + requisitos). A
// arquitetura NATIVA do lado reverso (_reversa_sdd/: architecture.md, C4, ERD,
// dependencies.md) é texto livre gerado por IA, sem template fixo confirmado — fica de
// fora por ora (ver docs/plano-sdd-graph.md B.6/D). Aqui a arquitetura usa o heurístico
// já existente, alimentado pelo caminho real de "Arquivo alvo" de cada ação.
import fs from 'node:fs';
import path from 'node:path';
import { buildArchHeuristic } from '../parse.mjs';
import { runDoctor } from '../doctor.mjs';
import { computeConfidence } from '../confidence.mjs';

const FORWARD_DIR = '_reversa_forward';

/** specsDir é reinterpretado como "um caminho dentro do projeto" (mesma convenção do
 *  adapter SpecKit); a raiz do projeto é o pai desse caminho. */
function projectRoot(specsDir) {
  return specsDir ? path.dirname(path.resolve(specsDir)) : process.cwd();
}
function forwardDir(specsDir) {
  return path.join(projectRoot(specsDir), FORWARD_DIR);
}

/** Confiança 0..1: existe _reversa_forward/<algo>/actions.md? */
function detect(specsDir) {
  const dir = forwardDir(specsDir);
  if (!fs.existsSync(dir)) return 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'actions.md'))) return 1;
    }
  } catch { /* ignora */ }
  return 0;
}

/** Linhas de tabela Markdown (ignora linha separadora `|---|---|`). */
function tableRows(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const m = raw.match(/^\|(.+)\|\s*$/);
    if (!m) continue;
    const cells = m[1].split('|').map(c => c.trim().replace(/`/g, ''));
    if (cells.every(c => /^:?-+:?$/.test(c))) continue; // separador
    rows.push(cells);
  }
  return rows;
}

const PHASE_RE = /^##\s+Fase\s+\d+,\s*(.+?)\s*$/i;
const EMENDAS_RE = /^##\s+Emendas\s*$/i;

/** Prioridade a partir do NOME da fase (não da posição — fases podem ser omitidas). */
function phasePriority(phaseName) {
  if (/prepara[cç][aã]o/i.test(phaseName)) return 'SETUP';
  if (/polimento/i.test(phaseName)) return 'POLISH';
  return null; // Testes/Núcleo/Integração/Emendas: sem P1/P2/P3 na fonte — honesto deixar em branco
}

/** actions.md → tasks[] (id, label, phase, priority, deps, parallel, done, frs, targetFile). */
function parseActionsMd(text) {
  const lines = text.split('\n');
  const rows = []; // {id, cells, phase}
  let phase = null;
  for (const raw of lines) {
    const ph = raw.match(PHASE_RE);
    if (ph) { phase = ph[1]; continue; }
    if (EMENDAS_RE.test(raw)) { phase = 'Emendas'; continue; }
    if (/^##\s/.test(raw) && !ph) phase = phase; // outros headings (Resumo, Notas…) não mudam a fase de ações
    const m = raw.match(/^\|\s*([TE]\d+)\s*\|(.+)\|\s*$/);
    if (!m || !phase) continue;
    const cells = m[2].split('|').map(c => c.trim().replace(/`/g, ''));
    rows.push({ id: m[1], phase, cells });
  }
  const ids = new Set(rows.map(r => r.id));
  const tasks = rows.map(({ id, phase, cells }) => {
    const [label = '', depsCell = '-', parCell = '', targetFile = '', , statusCell = ''] = cells;
    const depsRaw = depsCell === '-' || !depsCell ? [] : depsCell.split(',').map(s => s.trim()).filter(Boolean);
    return {
      id, label, phase,
      priority: id.startsWith('E') ? null : phasePriority(phase),
      story: null,
      done: /\[[xX]\]/.test(statusCell),
      inProgress: false, // o template só tem [ ] / [X] — sem estado "em andamento" na fonte
      parallel: parCell.includes('[//]'),
      depsRaw,
      deps: depsRaw.filter(d => ids.has(d) && d !== id),
      frs: [...new Set((label + ' ' + targetFile).match(/RF-\d+[a-z]?/gi) || [])].map(s => s.toUpperCase()),
      targetFile: targetFile || null,
    };
  });
  return tasks;
}

const MOSCOW = { must: 'P1', should: 'P2', could: 'P3' };
function moscowToPriority(s) {
  const k = String(s || '').trim().toLowerCase().split(/\s/)[0];
  return MOSCOW[k] || null;
}

/** requirements.md → { frText, usecases (personas), actors }. */
function parseRequirementsMd(text) {
  const lines = text.split('\n');
  const sections = []; // {name, start, end}
  let cur = null;
  lines.forEach((raw, i) => {
    const h = raw.match(/^##\s+\d+\.\s*(.+?)\s*$/);
    if (h) { if (cur) cur.end = i; cur = { name: h[1], start: i + 1, end: lines.length }; sections.push(cur); }
  });
  const section = re => sections.find(s => re.test(s.name));

  const frText = {}, frPriority = {};
  const frSec = section(/Requisitos Funcionais/i);
  if (frSec) {
    tableRows(lines.slice(frSec.start, frSec.end).join('\n')).forEach(cells => {
      const [id, texto, prioridade] = cells;
      if (!/^RF-\d+/i.test(id || '')) return; // pula cabeçalho da tabela
      frText[id.toUpperCase()] = texto || '';
      frPriority[id.toUpperCase()] = moscowToPriority(prioridade);
    });
  }

  const usecases = [], actors = new Set();
  const persSec = section(/Personas e cen.rios de uso/i);
  if (persSec) {
    let n = 0;
    tableRows(lines.slice(persSec.start, persSec.end).join('\n')).forEach(cells => {
      const [persona, objetivo, cenario] = cells;
      if (!persona || persona.toLowerCase() === 'persona') return; // pula cabeçalho
      n++;
      actors.add(persona);
      usecases.push({ id: 'US' + n, title: objetivo || persona, priority: null, actor: persona, desc: cenario || objetivo || '' });
    });
  }
  return { frText, frPriority, usecases, actors: [...actors] };
}

/** Lê e normaliza um único _reversa_forward/<slug>/ → Unit (mesmo shape do SpecKit). */
function parseUnit(dir) {
  const tasks = parseActionsMd(fs.readFileSync(path.join(dir, 'actions.md'), 'utf8'));
  const reqFile = path.join(dir, 'requirements.md');
  const req = fs.existsSync(reqFile) ? parseRequirementsMd(fs.readFileSync(reqFile, 'utf8')) : { frText: {}, frPriority: {}, usecases: [], actors: [] };
  // requisitos citados numa task herdam prioridade MoSCoW se a task não tiver uma própria
  tasks.forEach(t => { if (!t.priority && t.frs.length) { const p = t.frs.map(f => req.frPriority[f]).find(Boolean); if (p) t.priority = p; } });

  const archTasks = tasks.map(t => ({ label: `${t.label} ${t.targetFile || ''}` }));
  const arch = buildArchHeuristic(archTasks, {});

  const rec = { tasks, usecases: req.usecases, actors: req.actors, frText: req.frText, arch };
  rec.diagnostics = runDoctor(rec);

  const ids = new Set(tasks.map(t => t.id));
  let resolved = 0, unresolved = 0;
  tasks.forEach(t => t.depsRaw.forEach(d => { if (ids.has(d) && d !== t.id) resolved++; else unresolved++; }));
  const provenance = {
    taskLines: { exact: tasks.length, unmatched: 0 },
    depEdges: { resolved, unresolved },
    arch: { source: !!arch.source, baseAmbiguous: false },
    imports: null,
  };
  rec.confidence = { ...computeConfidence(provenance), provenance };
  return rec;
}

/** Lê todas as unidades dentro de _reversa_forward/ → { slug: Unit }. */
function parse(specsDir) {
  const dir = forwardDir(specsDir);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const unitDir = path.join(dir, e.name);
    if (!fs.existsSync(path.join(unitDir, 'actions.md'))) continue;
    const unit = parseUnit(unitDir);
    unit.source = 'reversa';
    out[e.name] = unit;
  }
  return out;
}

export default {
  name: 'reversa',
  label: 'Reversa',
  detect,
  parse,
  capabilities: { deps: true, stories: true, requirements: 'RF', architecture: 'heuristic' },
};
