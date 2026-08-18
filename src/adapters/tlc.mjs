// Adapter tlc-spec-driven (catálogo tech-leads-club/agent-skills, skill "tlc-spec-driven"
// v3.3.0) — lê .specs/features/<feature>/{spec.md,tasks.md} e devolve unidades no modelo
// canônico.
//
// Formato confirmado direto no SKILL.md e nos references/specify.md + references/tasks.md
// da skill (não a descrição do README — mesma exigência de "confirmar verbatim" que já
// valeu para o Reversa, depois do BMad ter mudado de formato sem aviso).
//
// Escopo desta primeira versão: só `spec.md` (user stories P1/P2/P3 + tabela de
// Requirement Traceability) e `tasks.md` (task breakdown + execution plan). Ficam de fora
// por ora: `design.md`/`context.md`/`validation.md` (texto livre, só existem em escopo
// Large/Complex, sem template fixo) e `.specs/STATE.md` (log de decisões a nível de
// projeto, não de unidade — não cabe no modelo por-unidade atual). Arquitetura usa o
// heurístico já existente, alimentado pelo campo "Where" de cada task (mesma ideia do
// Reversa com "Arquivo alvo").
//
// Decisão de mapeamento: o template não liga cada critério EARS a um id de requisito
// individual — só a tabela de Requirement Traceability liga `id → Story`. Por isso
// frText[id] vira a frase da User Story correspondente (não o AC em si) — honesto sobre o
// que a fonte realmente oferece, em vez de inventar granularidade que ela não tem.
import fs from 'node:fs';
import path from 'node:path';
import { buildArchHeuristic } from '../parse.mjs';
import { runDoctor } from '../doctor.mjs';
import { computeConfidence } from '../confidence.mjs';

const SPECS_DIR = '.specs';
const FEATURES_DIR = 'features';

/** specsDir é reinterpretado como "um caminho dentro do projeto" (mesma convenção dos
 *  adapters SpecKit/Reversa); a raiz do projeto é o pai desse caminho. */
function projectRoot(specsDir) {
  return specsDir ? path.dirname(path.resolve(specsDir)) : process.cwd();
}
function featuresDir(specsDir) {
  return path.join(projectRoot(specsDir), SPECS_DIR, FEATURES_DIR);
}

/** Confiança 0..1: existe .specs/features/<algo>/spec.md? */
function detect(specsDir) {
  const dir = featuresDir(specsDir);
  if (!fs.existsSync(dir)) return 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'spec.md'))) return 1;
    }
  } catch { /* ignora */ }
  return 0;
}

/** Dica quando nada foi detectado: projeto tem .specs/ mas nenhuma feature com spec.md
 *  (escopo Small/Medium fica implícito no chat e nunca toca disco) ou só artefatos ainda
 *  não lidos por este adapter. Evita o erro genérico de "specs não encontrado". */
function hint(specsDir) {
  if (detect(specsDir)) return null;
  const root = projectRoot(specsDir);
  const specsRoot = path.join(root, SPECS_DIR);
  if (fs.existsSync(specsRoot)) {
    return `Encontrei '${SPECS_DIR}/' mas nenhum '${FEATURES_DIR}/<feature>/spec.md' — a skill ` +
      `tlc-spec-driven só grava artefatos formais em escopo Large/Complex (Small/Medium ficam ` +
      `implícitos no chat). design.md/context.md/validation.md/STATE.md ainda não são lidos por ` +
      `este adapter — ver docs/plano-sdd-graph.md.`;
  }
  return null;
}

function slugify(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Linhas de tabela Markdown (ignora a linha separadora `|---|---|`). */
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

const STORY_RE = /^###\s+P([1-3]):\s*(.+?)\s*$/;
const USER_STORY_RE = /^\*\*User Story\*\*:\s*(.+?)\s*$/i;
const ACTOR_RE = /^As an?\s+(.+?),/i;

/** spec.md → { usecases, frText, frPriority, storyByReqId }. */
function parseSpecMd(text) {
  const lines = text.split('\n');

  // User Stories: cada bloco "### P<n>: <título>" até o próximo heading.
  const usecases = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(STORY_RE);
    if (!m) continue;
    const priority = 'P' + m[1];
    const title = m[2].replace(/\s*⭐.*$/, '').trim();
    let desc = '', actor = '';
    for (let j = i + 1; j < lines.length && !/^###\s/.test(lines[j]); j++) {
      const us = lines[j].match(USER_STORY_RE);
      if (us) {
        desc = us[1];
        const am = desc.match(ACTOR_RE);
        if (am) actor = am[1];
        break;
      }
    }
    const id = slugify(title) || `story-${priority.toLowerCase()}`;
    usecases.push({ id, title, priority, actor, desc });
  }

  // Requirement Traceability: | Requirement ID | Story | Phase | Status |
  const frText = {}, frPriority = {}, storyByReqId = {};
  const tIdx = lines.findIndex(l => /^##\s+Requirement Traceability/i.test(l));
  if (tIdx >= 0) {
    const endIdx = lines.findIndex((l, i) => i > tIdx && /^##\s+/.test(l));
    const block = lines.slice(tIdx + 1, endIdx >= 0 ? endIdx : lines.length).join('\n');
    tableRows(block).forEach(cells => {
      const [id, story] = cells;
      if (!id || /^requirement id$/i.test(id)) return; // pula cabeçalho da tabela
      const storyCell = String(story || '').trim();
      let usecase = usecases.find(u => `${u.priority}: ${u.title}` === storyCell);
      if (!usecase) {
        const pm = storyCell.match(/^P([1-3])/);
        if (pm) {
          const candidates = usecases.filter(u => u.priority === 'P' + pm[1]);
          // só usa o fallback por prioridade quando é inequívoco — com 2+ stories na mesma
          // prioridade, adivinhar qual delas seria inventar um vínculo que a fonte não deu.
          if (candidates.length === 1) usecase = candidates[0];
        }
      }
      storyByReqId[id] = usecase ? usecase.id : null;
      frPriority[id] = usecase ? usecase.priority : null;
      frText[id] = usecase ? usecase.desc : storyCell;
    });
  }

  return { usecases, frText, frPriority, storyByReqId };
}

const PHASE_RE = /^###\s+Phase\s+\d+:\s*(.+?)\s*$/;
const TASK_RE = /^###\s+(T\d+):\s*(.+?)\s*$/;

/** "### Phase N: <nome>" seguido do primeiro bloco ```...``` com ids T\d+ → fase por id.
 *  O primeiro bloco visto pra cada id vence (a "Phase Execution Map" final repete tudo
 *  junto, mas as fases individuais da Execution Plan aparecem antes no arquivo). */
function parsePhases(text) {
  const phaseByTaskId = {};
  let currentPhase = null, inFence = false;
  for (const raw of text.split('\n')) {
    const ph = raw.match(PHASE_RE);
    if (ph) { currentPhase = ph[1]; continue; }
    if (/^```/.test(raw)) { inFence = !inFence; continue; }
    if (inFence && currentPhase) {
      const ids = raw.match(/T\d+/g);
      if (ids) ids.forEach(id => { if (!(id in phaseByTaskId)) phaseByTaskId[id] = currentPhase; });
    }
  }
  return phaseByTaskId;
}

/** tasks.md → tasks[] (id, label, phase, priority, story, done, inProgress, parallel,
 *  depsRaw, deps, frs, targetFile). Prioridade/story vêm do Requirement citado (ver
 *  storyByReqId/frPriority de parseSpecMd) — as fases do tlc são só organizacionais. */
function parseTasksMd(text, { frPriority, storyByReqId }) {
  const lines = text.split('\n');
  const phaseByTaskId = parsePhases(text);

  const headerIdxs = [];
  lines.forEach((l, i) => { if (TASK_RE.test(l)) headerIdxs.push(i); });

  const tasks = headerIdxs.map((startIdx, k) => {
    const endIdx = k + 1 < headerIdxs.length ? headerIdxs[k + 1] : lines.length;
    const block = lines.slice(startIdx, endIdx);
    const blockText = block.join('\n');
    const header = block[0].match(TASK_RE);
    const id = header[1];
    const label = header[2];

    const whereM = blockText.match(/^\*\*Where\*\*:\s*`?([^`\n]+?)`?\s*$/mi);
    const targetFile = whereM ? whereM[1].trim() : null;

    const depsM = blockText.match(/^\*\*Depends on\*\*:\s*(.+?)\s*$/mi);
    const depsCell = depsM ? depsM[1].trim() : '';
    const depsRaw = /^(none|-)?$/i.test(depsCell) ? [] : depsCell.split(',').map(s => s.trim()).filter(Boolean);

    const reqM = blockText.match(/^\*\*Requirement\*\*:\s*(.+?)\s*$/mi);
    const reqId = reqM ? reqM[1].trim() : null;

    const doneIdx = block.findIndex(l => /\*\*Done when\*\*:/i.test(l));
    const doneItems = [];
    if (doneIdx >= 0) {
      // Coleta itens `- [ ]`/`- [x]` até a próxima linha "**Campo**:" (fim do checklist) —
      // tolera linhas em branco entre itens (comum em Markdown gerado por LLM/editor).
      for (let i = doneIdx + 1; i < block.length && !/^\*\*[^*]+\*\*:/.test(block[i]); i++) {
        const cm = block[i].match(/^-\s*\[([ xX])\]/);
        if (cm) doneItems.push(cm[1].toLowerCase() === 'x');
      }
    }
    const done = doneItems.length > 0 && doneItems.every(Boolean);
    const inProgress = !done && doneItems.some(Boolean);

    return {
      id, label, phase: phaseByTaskId[id] || null,
      priority: reqId ? (frPriority[reqId] || null) : null,
      story: reqId ? (storyByReqId[reqId] || null) : null,
      done, inProgress,
      parallel: false, // template do tlc é sequencial — sem marcador de paralelismo na fonte
      depsRaw,
      frs: reqId ? [reqId] : [],
      targetFile,
    };
  });

  const ids = new Set(tasks.map(t => t.id));
  tasks.forEach(t => { t.deps = t.depsRaw.filter(d => ids.has(d) && d !== t.id); });
  return tasks;
}

/** Lê e normaliza uma única .specs/features/<feature>/ → Unit (mesmo shape do SpecKit/Reversa). */
function parseUnit(dir) {
  const { usecases, frText, frPriority, storyByReqId } = parseSpecMd(fs.readFileSync(path.join(dir, 'spec.md'), 'utf8'));

  const tasksFile = path.join(dir, 'tasks.md');
  const tasks = fs.existsSync(tasksFile)
    ? parseTasksMd(fs.readFileSync(tasksFile, 'utf8'), { frPriority, storyByReqId })
    : []; // escopo Small/Medium: tasks ficam implícitas no chat, nunca tocam disco

  const archTasks = tasks.map(t => ({ label: `${t.label} ${t.targetFile || ''}` }));
  const arch = buildArchHeuristic(archTasks, {});

  const actors = [...new Set(usecases.map(u => u.actor).filter(Boolean))];
  const rec = { tasks, usecases, actors, frText, arch };
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

/** Lê todas as unidades dentro de .specs/features/ → { slug: Unit }. */
function parse(specsDir) {
  const dir = featuresDir(specsDir);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const unitDir = path.join(dir, e.name);
    if (!fs.existsSync(path.join(unitDir, 'spec.md'))) continue;
    const unit = parseUnit(unitDir);
    unit.source = 'tlc';
    out[e.name] = unit;
  }
  return out;
}

export default {
  name: 'tlc',
  label: 'TLC Spec-Driven',
  detect,
  parse,
  hint,
  capabilities: { deps: true, stories: true, requirements: 'ID', architecture: 'heuristic' },
};
