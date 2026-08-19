// sdd-graph — parser de tasks.md do SpecKit para grafo (nós + arestas).
// Genérico: descobre todos os specs/*/tasks.md do projeto onde roda.
import fs from 'node:fs';
import path from 'node:path';
import { runDoctor } from './doctor.mjs';
import { computeConfidence } from './confidence.mjs';

/** Lê um arquivo de texto normalizando quebras de linha (CRLF/CR → LF) antes do parsing.
 *  Várias regexes abaixo (e nos adapters) ancoram em `$` sem `\s*` antes — um `\r`
 *  residual (arquivo criado/editado no Windows) faz esse casamento falhar em silêncio.
 *  Exportada para reuso por outros adapters (mesmo motivo de buildArchHeuristic). */
export function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

/** Extrai todas as dependências (ids Txxx) declaradas via "depende de ..."/"depends on ..."
 *  num rótulo (PT + EN — o próprio exemplo oficial do spec-kit usa "depends on"). */
export function parseTaskDeps(label) {
  const deps = new Set();
  const re = /(?:depende de|depends?\s+on)\s+([^.)\n]*)/gi;      // pode haver mais de um trecho
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
  const raw = readText(file);
  const lines = raw.split('\n');
  const nodes = [];
  let curPhase = null, curStory = null, curPriority = null, curPhaseIdx = 0;
  // Inferência de dependência quando a task não declara nenhuma explicitamente (comum: a
  // geração oficial do spec-kit NUNCA exige anotação inline "(depends on Txxx)" — só o
  // formato "- [ ] [ID] [P?] [Story?] Description" é obrigatório). A fonte real e estável
  // de ordenação é estrutural: fases sempre sequenciais ("Foundational... BLOCKS all user
  // stories", texto padrão gerado em todo tasks.md) e o marcador [P], definido oficialmente
  // como "no dependencies on incomplete tasks". Ver docs/plano-sdd-graph.md.
  let curPhaseTaskIds = [], prevPhaseTaskIds = [];

  const phaseRe = /^##\s+Phase\s+(\d+):\s+(.+)$/;
  const storyRe = /User Story\s+(\d+)\s*-\s*(.+?)\s*\(Priority:\s*(P\d)\)/;
  const taskRe = /^-\s+\[( |X|x|~)\]\s+(T\d+)\s+(.*)$/;

  for (const line of lines) {
    const pm = line.match(phaseRe);
    if (pm) {
      prevPhaseTaskIds = curPhaseTaskIds;
      curPhaseTaskIds = [];
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
      const id = tm[2];
      let deps = parseTaskDeps(rest);
      let depsInferred = false;
      if (!deps.length) {
        // 1ª task da fase (ou [P], que nunca depende de irmãs da própria fase): gate
        // completo na fase anterior inteira — garante que o painel "próximo a fazer"/
        // kanban (que checa deps.every(d=>doneSet.has(d))) só libere quando ela terminar
        // de verdade, batendo com "BLOCKS all user stories" do próprio spec-kit.
        if (!curPhaseTaskIds.length || parallel) {
          deps = [...prevPhaseTaskIds];
        } else {
          // não-[P], não-1ª da fase: encadeia na task anterior do arquivo (barato; a
          // garantia da fase já veio via a 1ª task, herdada transitivamente pelo `done`).
          const prev = nodes[nodes.length - 1];
          if (prev) deps = [prev.id];
        }
        if (deps.length) depsInferred = true;
      }
      nodes.push({
        id,
        label: label.trim(),
        phase: curPhase,
        phaseIdx: curPhaseIdx,
        story: curStory,
        priority: curPriority,
        done: tm[1].toLowerCase() === 'x',
        inProgress: tm[1] === '~',
        parallel,
        deps,
        depsInferred,
        frs: [...new Set(rest.match(/FR-\d+[a-z]?/g) || [])],
      });
      curPhaseTaskIds.push(id);
    }
  }
  // guarda as deps cruas (para o Doctor detectar DEP_UNKNOWN/SELF_DEP) e
  // depois filtra as deps usáveis (remove ids inexistentes / auto-referência).
  const ids = new Set(nodes.map(n => n.id));
  nodes.forEach(n => { n.depsRaw = [...n.deps]; n.deps = n.deps.filter(d => ids.has(d) && d !== n.id); });
  return nodes;
}

/** Faz o parse do spec.md: casos de uso (user stories) e texto dos FRs. */
export function parseSpecMd(specDir) {
  const f = path.join(specDir, 'spec.md');
  if (!fs.existsSync(f)) return { usecases: [], actors: [], frText: {} };
  const lines = readText(f).split('\n');
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
      // PT ("Como X,") + EN ("As a/an X,") — o template oficial não exige nenhum padrão de
      // frase fixo, então prosa totalmente livre (comum em specs reais) cai no genérico
      // 'Ator' mesmo com os dois padrões; extrair de prosa livre exigiria NLP, fora de escopo.
      const am = body.match(/^(?:Como|As an?)\s+([^,]+),/i);
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

function planFields(specDir) {
  const planFile = path.join(specDir, 'plan.md');
  const plan = fs.existsSync(planFile) ? readText(planFile) : '';
  const field = re => { const m = plan.match(re); return m ? m[1].trim() : ''; };
  return {
    storage: field(/\*\*Storage\*\*:\s*([^\n(]+)/),
    language: field(/\*\*Language\/Version\*\*:\s*([^\n]+)/),
  };
}

/** Lista arquivos com uma extensão sob dir (recursivo), pulando testes/deps/artefatos. */
const SKIP_DIRS = /^(test|tests|__tests__|node_modules|dist|build|out|target|vendor|\.git)$/;
function walkFiles(dir, ext) {
  const out = [];
  (function w(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.test(e.name)) w(p); }
      else if (e.name.endsWith(ext)) out.push(p);
    }
  })(dir);
  return out;
}

/** Normaliza nomes de camada (varia por convenção/idioma) para grupos canônicos. EN + PT-BR. */
function canonGroup(name) {
  const n = String(name || '').toLowerCase();
  if (/^(service|services|servico|servicos|negocio|negocios|dominio|aplicacao|regra|regras|caso|casos)$/.test(n)) return 'services';
  if (/^(integration|integrations|integracao|integracoes|adapter|adapters|adaptador|adaptadores|client|clients|cliente|clientes|gateway|gateways|external|externals|externo|externos)$/.test(n)) return 'integrations';
  if (/^(model|models|modelo|modelos|entity|entities|entidade|entidades|domain|repository|repositories|repositorio|repositorios|dao|persistence|persistencia|dto|vo|dados|dado)$/.test(n)) return 'models';
  if (/^(db|database|banco|migration|migrations)$/.test(n)) return 'db';
  if (/^(api|controller|controllers|controle|controles|controlador|controladores|rest|resource|resources|recurso|recursos|route|routes|rota|rotas|handler|handlers|endpoint|endpoints)$/.test(n)) return 'api';
  if (/^(web|ui|view|views|visao|visoes|tela|telas|template|templates|frontend)$/.test(n)) return 'web';
  if (/^(config|configuration|configuracao|configuracoes|settings)$/.test(n)) return 'config';
  return n || null;
}

/** Python: imports internos absolutos (`from src.a.b`) e relativos (`from ..a.b`). */
function scanPythonSource(srcDir) {
  if (!fs.existsSync(srcDir)) return null;
  const files = walkFiles(srcDir, '.py').filter(f => !f.endsWith('__init__.py'));
  if (!files.length) return null;
  const out = files.map(abs => {
    const parts = path.relative(srcDir, abs).replace(/\.py$/, '').split(path.sep);
    const dirParts = parts.slice(0, -1);
    const text = readText(abs);
    const imports = [];
    let m;
    // absolutos: from src.a.b … / import src.a.b  (proveniência exata)
    const reAbs = /^\s*(?:from|import)\s+(src\.[\w.]+)/gm;
    while ((m = reAbs.exec(text)) !== null) { const p = m[1].split('.').slice(1); imports.push({ group: canonGroup(p[0]), name: p[1], prov: 'exact' }); }
    // relativos: from ..a.b import x  (resolvidos contra o caminho do arquivo; proveniência inferida)
    const reRel = /^\s*from\s+(\.+)([\w.]*)\s+import/gm;
    while ((m = reRel.exec(text)) !== null) {
      const up = m[1].length - 1, mod = m[2];
      if (!mod) continue;
      if (up > dirParts.length) { imports.push({ group: null, name: null, prov: 'unresolved' }); continue; }
      const seg = dirParts.slice(0, dirParts.length - up).concat(mod.split('.'));
      imports.push({ group: canonGroup(seg[0]), name: seg[1], prov: 'inferred' });
    }
    return { group: canonGroup(parts[0]), sub: parts.length > 2 ? parts[1] : null, module: parts[parts.length - 1], imports };
  });
  return { files: out, lang: 'Python' };
}

/** Java: package/import sob um pacote-base detectado (ex.: com.exemplo.projeto). */
function scanJavaSource(srcRoot) {
  if (!fs.existsSync(srcRoot)) return null;
  const files = walkFiles(srcRoot, '.java').filter(f => !/(package|module)-info\.java$/.test(f));
  if (!files.length) return null;
  const parsed = files.map(abs => {
    const text = readText(abs);
    const pkg = (text.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1] || '';
    const imports = [];
    const re = /^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm;
    let m; while ((m = re.exec(text)) !== null) imports.push(m[1]);
    return { seg: pkg ? pkg.split('.') : [], imports, cls: path.basename(abs, '.java') };
  }).filter(p => p.seg.length);
  if (!parsed.length) return null;
  // pacote-base = maior prefixo comum das declarações de package
  let base = parsed[0].seg.slice();
  for (const p of parsed) { let i = 0; while (i < base.length && base[i] === p.seg[i]) i++; base = base.slice(0, i); }
  // ambíguo: base vazia (raízes díspares) ou precisou aparar (todos no mesmo package)
  let baseAmbiguous = base.length === 0;
  if (base.length && parsed.every(p => p.seg.length === base.length)) { base = base.slice(0, -1); baseAmbiguous = true; }
  const bl = base.length;
  const inBase = segs => segs.length > bl && base.every((s, i) => segs[i] === s);
  const out = parsed.map(p => {
    const rem = p.seg.slice(bl);
    const imports = p.imports.map(s => s.split('.')).filter(inBase)
      .map(segs => ({ group: canonGroup(segs[bl]), name: segs[bl + 1], prov: 'exact' }));
    return { group: canonGroup(rem[0]), sub: rem[1] || null, module: p.cls, imports };
  });
  return { files: out, lang: 'Java', baseAmbiguous };
}

/** Resolve um import de TS/JS a {group,name,prov}. Retorna null se for pacote externo (bare). */
function resolveJsImport(spec, dirParts) {
  if (spec.startsWith('.')) {
    // relativo: resolvido contra o diretório do arquivo (proveniência inferida)
    const sp = spec.split('/').filter(s => s !== '' && s !== '.');
    let base = dirParts.slice();
    for (const s of sp) { if (s === '..') base = base.slice(0, -1); else base.push(s); }
    if (!base.length) return { group: null, name: null, prov: 'unresolved' };
    return { group: canonGroup(base[0]), name: base[1] || null, prov: 'inferred' };
  }
  if (/^(@|~|src)\//.test(spec)) {
    // alias comum para a raiz do src (@/… ~/… src/…) — proveniência exata
    const sp = spec.replace(/^(@|~|src)\//, '').split('/').filter(Boolean);
    return { group: canonGroup(sp[0]), name: sp[1] || null, prov: 'exact' };
  }
  return null; // bare specifier (react, lodash, @scope/pkg) = dependência externa, ignorada
}

/** TS/JS: imports internos (relativos e alias @//~//src/). Externos (bare) são ignorados. */
export function scanJsSource(srcDir) {
  if (!fs.existsSync(srcDir)) return null;
  let files = [];
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) files = files.concat(walkFiles(srcDir, ext));
  files = files.filter(f => !/\.d\.ts$/.test(f) && !/\.(test|spec)\.[jt]sx?$/.test(f));
  if (!files.length) return null;
  const out = files.map(abs => {
    const parts = path.relative(srcDir, abs).replace(/\.(tsx?|jsx?|mjs|cjs)$/, '').split(path.sep);
    const dirParts = parts.slice(0, -1);
    const text = readText(abs);
    const specs = [];
    let m;
    const patterns = [
      /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g,  // import x from '…' / export … from '…'
      /import\s*['"]([^'"]+)['"]/g,                        // import '…' (side-effect)
      /require\(\s*['"]([^'"]+)['"]\s*\)/g,                // require('…')
      /import\(\s*['"]([^'"]+)['"]\s*\)/g,                 // import('…') dinâmico
    ];
    for (const re of patterns) while ((m = re.exec(text)) !== null) specs.push(m[1]);
    const imports = [];
    for (const s of [...new Set(specs)]) { const r = resolveJsImport(s, dirParts); if (r) imports.push(r); }
    return { group: canonGroup(parts[0]), sub: parts.length > 2 ? parts[1] : null, module: parts[parts.length - 1], imports };
  });
  return { files: out, lang: 'TypeScript/JavaScript' };
}

// Diretórios "contêiner" do Go que não são camadas (a camada vem do próximo segmento).
const GO_CONTAINERS = new Set(['internal', 'pkg', 'cmd', 'app', 'src']);
function dropContainers(segs) { let i = 0; while (i < segs.length && GO_CONTAINERS.has(segs[i])) i++; return segs.slice(i); }

/** Módulo declarado no go.mod mais próximo (subindo a partir de dir). */
function findGoModule(dir) {
  let d = dir;
  for (let i = 0; i < 6; i++) {
    const f = path.join(d, 'go.mod');
    if (fs.existsSync(f)) { const m = readText(f).match(/^\s*module\s+(\S+)/m); return m ? m[1] : null; }
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  return null;
}

/** Go: imports internos (caminho começa com o módulo do go.mod). Stdlib/externos ignorados. */
export function scanGoSource(srcDir) {
  if (!fs.existsSync(srcDir)) return null;
  const files = walkFiles(srcDir, '.go').filter(f => !/_test\.go$/.test(f));
  if (!files.length) return null;
  const mod = findGoModule(srcDir);
  const out = files.map(abs => {
    const parts = path.relative(srcDir, abs).replace(/\.go$/, '').split(path.sep);
    const layer = dropContainers(parts.slice(0, -1));
    const text = readText(abs);
    const paths = [];
    (text.match(/import\s*\(([\s\S]*?)\)/g) || []).forEach(b => { let mm; const re = /"([^"]+)"/g; while ((mm = re.exec(b)) !== null) paths.push(mm[1]); });
    (text.match(/^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm) || []).forEach(s => { const mm = s.match(/"([^"]+)"/); if (mm) paths.push(mm[1]); });
    const imports = [];
    for (const p of paths) {
      if (mod && p.startsWith(mod + '/')) {
        const rem = dropContainers(p.slice(mod.length + 1).split('/'));
        imports.push({ group: canonGroup(rem[0]), name: rem[1] || null, prov: 'exact' });
      }
    }
    return { group: canonGroup(layer[0]), sub: layer[1] || null, module: parts[parts.length - 1], imports };
  });
  return { files: out, lang: 'Go' };
}

/** Arquitetura PRECISA: expande serviços e liga cada um ao adapter/modelo real (via imports). */
function buildArchFromSource(scan, meta) {
  const nodes = [], links = [], ids = new Set();
  const add = (id, label, kind, layer, items) => { if (!ids.has(id)) { nodes.push({ id, label, kind, layer, items: items || [] }); ids.add(id); } return id; };
  const link = (a, b) => { if (a && b && a !== b) links.push([a, b]); };
  const groups = new Set(scan.files.map(f => f.group));
  const svcFiles = scan.files.filter(f => f.group === 'services');
  const apiFiles = scan.files.filter(f => f.group === 'api');

  // adapters/externals: PACOTE de integração (src/integrations/<pkg>), não o arquivo
  const intNames = new Set(scan.files.filter(f => f.group === 'integrations' && f.sub).map(f => f.sub));
  scan.files.forEach(f => f.imports.forEach(i => { if (i.group === 'integrations' && i.name) intNames.add(i.name); }));

  add('op', 'Operador', 'actor', 0);
  let up = 'op';
  if (groups.has('web')) { add('ui', 'Web UI', 'ui', 1); link(up, 'ui'); up = 'ui'; }
  const hasApi = groups.has('api');
  if (hasApi) { add('api', 'API', 'api', 2); link(up, 'api'); up = 'api'; }

  svcFiles.forEach(s => add('svc_' + s.module, s.module, 'service', 3));
  intNames.forEach(n => { add('int_' + n, n + ' adapter', 'integration', 4); link('int_' + n, add('ext_' + n, n.toUpperCase(), 'external', 5)); });
  const hasData = groups.has('models') || groups.has('db');
  if (hasData) {
    const items = [...new Set(scan.files.filter(f => f.group === 'models' || f.group === 'db').map(f => f.module))];
    add('data', 'Modelos + Persistência', 'model', 4, items);
    if (meta.storage) link('data', add('store', meta.storage.replace(/[.;].*$/, '').trim(), 'datastore', 5));
  }
  if (groups.has('config')) { add('cfg', 'Config', 'config', 2); if (hasApi) link('cfg', 'api'); }

  // arestas por import real (com contagem de proveniência p/ o índice de confiança)
  const incoming = new Set();
  const ie = { exact: 0, inferred: 0, unresolved: 0 };
  const emit = (from, to) => { link(from, to); incoming.add(to); };
  svcFiles.forEach(s => {
    const id = 'svc_' + s.module;
    s.imports.forEach(i => {
      if (i.prov === 'unresolved') { ie.unresolved++; return; }
      let emitted = false;
      if (i.group === 'integrations' && i.name) { emit(id, 'int_' + i.name); emitted = true; }
      else if ((i.group === 'models' || i.group === 'db') && hasData) { emit(id, 'data'); emitted = true; }
      else if (i.group === 'services' && i.name && i.name !== s.module) { emit(id, 'svc_' + i.name); emitted = true; }
      if (emitted) (i.prov === 'inferred' ? ie.inferred++ : ie.exact++);
    });
  });
  // API → serviços que a API importa
  apiFiles.forEach(a => a.imports.forEach(i => { if (i.group === 'services' && i.name) { link('api', 'svc_' + i.name); incoming.add('svc_' + i.name); } }));
  // qualquer serviço sem entrada liga no backbone (API ou nó acima)
  svcFiles.forEach(s => { const id = 'svc_' + s.module; if (!incoming.has(id)) link(hasApi ? 'api' : up, id); });
  // sem camada de serviços: liga adapters/dados direto ao backbone para não ficarem soltos
  const backbone = svcFiles.length ? null : up;
  if (backbone) {
    intNames.forEach(n => { if (!incoming.has('int_' + n)) link(backbone, 'int_' + n); });
    if (hasData && !incoming.has('data')) link(backbone, 'data');
  }

  const seen = new Set();
  const uniq = links.filter(([a, b]) => { const k = a + '|' + b; if (seen.has(k)) return false; seen.add(k); return true; });
  return { nodes, links: uniq, meta, source: true, baseAmbiguous: !!scan.baseAmbiguous, provenance: { imports: ie } };
}

/** Arquitetura HEURÍSTICA (fallback): só specs, sem ler código. Serviços como um nó único.
 *  Exportada para reuso por outros adapters (ex.: Reversa, a partir do "Arquivo alvo"). */
export function buildArchHeuristic(tasks, meta) {
  const top = {};
  const pathRe = /src\/([a-zA-Z0-9_]+)(?:\/([a-zA-Z0-9_]+))?/g;
  tasks.forEach(t => { let m; while ((m = pathRe.exec(t.label)) !== null) { (top[m[1]] = top[m[1]] || new Set()); if (m[2] && m[2] !== 'main') top[m[1]].add(m[2]); } });
  const has = k => !!top[k], subs = k => (top[k] ? [...top[k]] : []);
  const nodes = [], links = [];
  const add = (id, label, kind, layer, items) => { nodes.push({ id, label, kind, layer, items: items || [] }); return id; };
  const link = (a, b) => { if (a && b) links.push([a, b]); };
  const actor = add('op', 'Operador', 'actor', 0); let prev = actor;
  if (has('web')) { const n = add('ui', 'Web UI', 'ui', 1, subs('web')); link(prev, n); prev = n; }
  if (has('api')) { const n = add('api', 'API', 'api', 2, subs('api')); link(prev, n); prev = n; }
  let svc = null;
  if (has('services')) { svc = add('svc', 'Serviços', 'service', 3, subs('services')); link(prev, svc); prev = svc; }
  const hub = svc || prev;
  if (has('config')) link(add('cfg', 'Config', 'config', 2), hub);
  if (has('integrations')) subs('integrations').forEach(name => { const a = add('int_' + name, name + ' adapter', 'integration', 4); link(hub, a); link(a, add('ext_' + name, name.toUpperCase(), 'external', 5)); });
  if (has('models') || has('db')) { const p = add('data', 'Modelos + Persistência', 'model', 4, [...subs('models'), ...subs('db')]); link(hub, p); if (meta.storage) link(p, add('store', meta.storage.replace(/[.;].*$/, '').trim(), 'datastore', 5)); }
  return { nodes, links, meta, source: false };
}

/**
 * Deriva a arquitetura. Se houver código Python em <projeto>/src, lê os imports
 * e liga cada serviço ao adapter/modelo real; senão, cai no heurístico (só specs).
 */
export function buildArch(tasks, specDir, srcOverride) {
  const meta = planFields(specDir);
  const projectRoot = path.resolve(specDir, '..', '..'); // specs/<slug> -> raiz do projeto
  const src = srcOverride ? path.resolve(srcOverride) : path.join(projectRoot, 'src');
  const scan = scanPythonSource(src) || scanJavaSource(src) || scanJsSource(src) || scanGoSource(src);
  const STRUCT = new Set(['services', 'api', 'integrations', 'models', 'web', 'db']);
  if (scan && scan.files.some(f => STRUCT.has(f.group))) {
    if (!meta.language && scan.lang) meta.language = scan.lang;
    return buildArchFromSource(scan, meta);
  }
  return buildArchHeuristic(tasks, meta);
}

/**
 * Descobre e faz o parse de todos os specs/<slug>/ sob specsDir.
 * opts.src: pasta de código para a arquitetura (override; útil em monorepos,
 * para escopar a varredura só à feature em vez do src/ inteiro).
 */
export function parseSpecs(specsDir, opts = {}) {
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
    const rec = {
      tasks,
      usecases: spec.usecases,
      actors: spec.actors,
      frText: spec.frText,
      arch: buildArch(tasks, dir, opts.src),
    };
    rec.diagnostics = runDoctor(rec);

    // proveniência p/ o índice de confiança
    const ids = new Set(tasks.map(t => t.id));
    const checkboxLines = (readText(tasksFile).match(/^\s*-\s*\[[ xX~]\]/gm) || []).length;
    let resolved = 0, unresolved = 0, inferred = 0;
    tasks.forEach(t => (t.depsRaw || []).forEach(d => {
      if (ids.has(d) && d !== t.id) { resolved++; if (t.depsInferred) inferred++; }
      else unresolved++;
    }));
    const provenance = {
      taskLines: { exact: tasks.length, unmatched: Math.max(0, checkboxLines - tasks.length) },
      depEdges: { resolved, unresolved, inferred },
      arch: { source: !!rec.arch.source, baseAmbiguous: !!rec.arch.baseAmbiguous },
      imports: rec.arch.provenance ? rec.arch.provenance.imports : null,
    };
    rec.confidence = { ...computeConfidence(provenance), provenance };

    out[entry.name] = rec;
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`Nenhum tasks.md encontrado em ${specsDir}/*/tasks.md`);
  }
  return out;
}
