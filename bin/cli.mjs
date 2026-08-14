#!/usr/bin/env node
// speckit-graph — CLI
// Uso:
//   speckit-graph [--specs <dir>] [--out <arquivo>] [--cdn] [--open] [--project <nome>]
//   speckit-graph init [--global]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile, execSync } from 'node:child_process';
import { parseSpecs } from '../src/parse.mjs';
import { renderHTML } from '../src/template.mjs';
import { buildGateReport, stringifyCanonical, gateMarkdown } from '../src/gate.mjs';
import { buildSummary } from '../src/summary.mjs';
import { buildSnapshot, diffReport, diffMarkdown } from '../src/diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const a = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { a.flags[key] = next; i++; }
      else a.flags[key] = true;
    } else a._.push(t);
  }
  return a;
}

function openFile(file) {
  const cmd = process.platform === 'darwin' ? 'open'
            : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
  execFile(cmd, args, () => {});
}

function findSpecsDir(explicit) {
  if (explicit) return path.resolve(explicit);
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'specs'),
    path.join(cwd, 'project', 'specs'),
    path.join(cwd, '.specify', '..', 'specs'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return path.join(cwd, 'specs'); // deixa o parse dar erro claro
}

// Definição de cada alvo: de onde vem o template e para onde vai (projeto/global).
const TARGETS = {
  claude: {
    label: 'Claude Code',
    src: 'claude/speckit-graph.md',
    invoke: '/speckit-graph',
    project: cwd => path.join(cwd, '.claude', 'commands', 'speckit-graph.md'),
    global: () => path.join(os.homedir(), '.claude', 'commands', 'speckit-graph.md'),
  },
  copilot: {
    label: 'GitHub Copilot (VS Code/JetBrains)',
    src: 'copilot/speckit-graph.prompt.md',
    invoke: '/speckit-graph',
    project: cwd => path.join(cwd, '.github', 'prompts', 'speckit-graph.prompt.md'),
    global: null, // prompt files não têm pasta global portável — sempre no workspace
  },
  'copilot-cli': {
    label: 'GitHub Copilot CLI (extensão — slash command direto)',
    src: 'copilot-cli/extension.mjs',
    invoke: '/speckit-graph',
    project: cwd => path.join(cwd, '.github', 'extensions', 'speckit-graph', 'extension.mjs'),
    global: null, // extensões são por-projeto na doc atual (.github/extensions/)
  },
  'copilot-cli-agent': {
    label: 'GitHub Copilot CLI (custom agent — alternativa)',
    src: 'copilot-cli/speckit-graph.agent.md',
    invoke: '/agent → speckit-graph  (ou: copilot --agent speckit-graph)',
    default: false, // só instala quando pedido explicitamente
    project: cwd => path.join(cwd, '.github', 'agents', 'speckit-graph.agent.md'),
    global: () => path.join(os.homedir(), '.copilot', 'agents', 'speckit-graph.agent.md'),
  },
  kiro: {
    label: 'Kiro',
    src: 'kiro/speckit-graph.md',
    invoke: '/speckit-graph',
    project: cwd => path.join(cwd, '.kiro', 'steering', 'speckit-graph.md'),
    global: () => path.join(os.homedir(), '.kiro', 'steering', 'speckit-graph.md'),
  },
};

function cmdInit(flags) {
  const requested = flags.target
    ? String(flags.target).split(',').map(s => s.trim().toLowerCase())
    : Object.keys(TARGETS).filter(k => TARGETS[k].default !== false);
  const cwd = process.cwd();

  for (const key of requested) {
    const t = TARGETS[key];
    if (!t) { console.error(`✗ Alvo desconhecido: ${key} (use claude, copilot ou kiro)`); continue; }
    let dest, scope;
    if (flags.global && t.global) { dest = t.global(); scope = 'global'; }
    else {
      dest = t.project(cwd); scope = 'projeto';
      if (flags.global && !t.global)
        console.log(`  (Copilot não tem pasta global portável — instalando no workspace)`);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'commands', t.src), dest);
    console.log(`✓ ${t.label} (${scope})`);
    console.log(`    arquivo:  ${dest}`);
    console.log(`    invocar:  ${t.invoke}`);
  }
}

function deriveProjectName(specsDir) {
  // nome do diretório-pai de specs/, subindo se for genérico (project/src/app…)
  const generic = new Set(['project', 'src', 'app', 'apps', '.']);
  let dir = path.resolve(specsDir, '..');
  let name = path.basename(dir);
  if (generic.has(name.toLowerCase())) {
    const up = path.basename(path.resolve(dir, '..'));
    if (up && up !== '/') name = up;
  }
  return name;
}

function cmdGenerate(flags) {
  const specsDir = findSpecsDir(flags.specs);
  const project = flags.project || deriveProjectName(specsDir);
  const out = path.resolve(flags.out || 'speckit-graph.html');
  const selfContained = !flags.cdn;
  const src = flags.src ? path.resolve(flags.src) : null; // escopo do código p/ arquitetura (monorepo)

  const data = parseSpecs(specsDir, { src });

  // --diff <snapshot.json | git-ref>: embute o diff (novo/concluído/alterado) para a sobreposição visual
  let diffLabel = null;
  if (flags.diff) {
    if (typeof flags.diff !== 'string') { console.error('✗ --diff: informe a base (ex.: --diff HEAD~1 ou --diff base.json)'); process.exit(2); }
    const base = resolveBaseSnapshot(flags.diff, specsDir, src);
    const rep = diffReport(base, buildSnapshot(data));
    diffLabel = /\.json$/i.test(flags.diff) ? path.basename(flags.diff) : flags.diff;
    for (const slug of Object.keys(data)) {
      if (rep.specs[slug]) data[slug].diff = { base: diffLabel, ...rep.specs[slug] };
    }
  }

  const html = renderHTML(data, { project, selfContained });
  fs.writeFileSync(out, html);

  const specs = Object.keys(data);
  const totals = specs.map(s => {
    const { tasks, usecases, arch } = data[s];
    const e = tasks.reduce((a, x) => a + x.deps.length, 0);
    return `  · ${s}: ${tasks.length} tasks (${e} deps), ${usecases.length} casos de uso, ${arch.nodes.length} componentes${arch.source ? ' [código]' : ' [heurístico]'}`;
  }).join('\n');
  console.log(`✓ Grafo gerado: ${out}`);
  console.log(`  Specs (${specs.length}):\n${totals}`);
  if (src) console.log(`  Arquitetura escopada a: ${src}`);
  if (diffLabel) console.log(`  Diff sobreposto vs. base: ${diffLabel}`);
  console.log(`  Modo: ${selfContained ? 'self-contained (offline)' : 'CDN'}`);
  if (flags.open) { openFile(out); console.log('  Abrindo no navegador…'); }
}

const SEV_ICON = { error: '❌', warn: '⚠️ ', info: 'ℹ️ ' };

function cmdDoctor(flags) {
  const specsDir = findSpecsDir(flags.specs);
  const src = flags.src ? path.resolve(flags.src) : null;
  const data = parseSpecs(specsDir, { src });
  let totalError = 0;
  for (const slug of Object.keys(data)) {
    const { diagnostics, confidence } = data[slug];
    const c = diagnostics.counts;
    totalError += c.error;
    const conf = confidence && confidence.index != null ? ` · confiança ${confidence.index}%` : '';
    console.log(`\n🔎 ${slug} — ${c.error} erro(s), ${c.warn} aviso(s), ${c.info} info${conf}`);
    if (!diagnostics.findings.length) { console.log('   ✓ nenhum problema encontrado.'); continue; }
    for (const f of diagnostics.findings) {
      console.log(`   ${SEV_ICON[f.severity]} [${f.id}] ${f.message}`);
    }
  }
  console.log('');
  // --doctor apenas relata; o exit code faz parte do futuro CI Gate (--check).
  if (flags.strict && totalError > 0) process.exit(1);
}

function cmdCheck(flags) {
  let data;
  try {
    const specsDir = findSpecsDir(flags.specs);
    const src = flags.src ? path.resolve(flags.src) : null;
    data = parseSpecs(specsDir, { src });
  } catch (e) { console.error('✗ ' + e.message); process.exit(2); }

  const baselinePath = flags.baseline ? path.resolve(flags.baseline) : null;
  const baseline = new Set();
  if (baselinePath && fs.existsSync(baselinePath)) {
    try { (JSON.parse(fs.readFileSync(baselinePath, 'utf8')).fingerprints || []).forEach(f => baseline.add(f)); }
    catch { console.error(`⚠️  baseline ilegível, ignorando: ${baselinePath}`); }
  }
  const gate = flags.gate ? String(flags.gate).split(',').map(s => s.trim()) : ['error'];
  const { report, passed, fingerprints } = buildGateReport(data, { gate, baseline });

  if (flags['update-baseline']) {
    const bp = baselinePath || path.resolve('speckit-graph.baseline.json');
    fs.writeFileSync(bp, stringifyCanonical({ tool: 'speckit-graph', schemaVersion: 1, fingerprints: [...fingerprints].sort() }));
    console.error(`✓ baseline atualizado: ${bp} (${fingerprints.size} findings)`);
    process.exit(0);
  }

  const out = flags.format === 'md'
    ? gateMarkdown(report, { baseUrl: flags['base-url'] })
    : stringifyCanonical(report);
  const dest = flags.json || flags.out;
  if (dest) { fs.writeFileSync(path.resolve(dest), out); console.error(`✓ ${flags.format === 'md' ? 'Markdown' : 'JSON'}: ${path.resolve(dest)}`); }
  else console.log(out); // stdout limpo p/ pipe

  const s = report.summary;
  console.error(`\n${passed ? '✓ gate PASSOU' : '✗ gate FALHOU'} — ${s.error} erro(s), ${s.warn} aviso(s), ${s.info} info · reprova em: ${gate.join(',')}${baseline.size ? ' · baseline aplicado' : ''}${report.gate.violations ? ` · ${report.gate.violations} violação(ões)` : ''}`);
  process.exit(passed ? 0 : 1);
}

function cmdSummary(flags) {
  const specsDir = findSpecsDir(flags.specs);
  const src = flags.src ? path.resolve(flags.src) : null;
  const project = flags.project || deriveProjectName(specsDir);
  const md = buildSummary(parseSpecs(specsDir, { src }), project);
  if (typeof flags.summary === 'string') {
    const out = path.resolve(flags.summary);
    fs.writeFileSync(out, md); console.error(`✓ resumo: ${out}`);
  } else console.log(md);
}

function cmdSnapshot(args) {
  const flags = args.flags;
  const specsDir = findSpecsDir(flags.specs);
  const src = flags.src ? path.resolve(flags.src) : null;
  const data = parseSpecs(specsDir, { src });
  const dest = path.resolve(args._[1] || flags.out || 'speckit-graph.snapshot.json');
  fs.writeFileSync(dest, stringifyCanonical(buildSnapshot(data)));
  const n = Object.keys(data).length;
  console.error(`✓ snapshot gravado: ${dest} (${n} spec(s))`);
}

/** Materializa os specs (e o src, se dentro do repo) de um git ref e faz o snapshot. */
function snapshotFromGitRef(ref, specsDir, src) {
  let root;
  try { root = execSync('git rev-parse --show-toplevel', { cwd: specsDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { console.error(`✗ '${ref}' não é um arquivo .json nem um repositório git acessível. Use --from <snapshot.json> ou rode dentro de um repo git.`); process.exit(2); }
  const rel = p => path.relative(root, path.resolve(p)).split(path.sep).join('/');
  const relSpecs = rel(specsDir);
  const relSrc = src ? rel(src) : null;
  const paths = [relSpecs];
  if (relSrc && !relSrc.startsWith('..')) paths.push(relSrc);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-diff-'));
  try {
    execSync(`git archive ${ref} -- ${paths.map(p => `'${p}'`).join(' ')} | tar -x -C '${tmp}'`, { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    const tmpSpecs = path.join(tmp, relSpecs);
    const tmpSrc = relSrc && !relSrc.startsWith('..') ? path.join(tmp, relSrc) : null;
    return buildSnapshot(parseSpecs(tmpSpecs, { src: tmpSrc && fs.existsSync(tmpSrc) ? tmpSrc : null }));
  } catch (e) {
    console.error(`✗ não consegui ler os specs do ref '${ref}': ${String(e.stderr || e.message).trim()}`);
    process.exit(2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Resolve a base do diff: um snapshot .json salvo ou um git ref materializado. */
function resolveBaseSnapshot(fromArg, specsDir, src) {
  const asFile = path.resolve(fromArg);
  if (/\.json$/i.test(fromArg) || fs.existsSync(asFile)) {
    let j;
    try { j = JSON.parse(fs.readFileSync(asFile, 'utf8')); }
    catch { console.error(`✗ não consegui ler o snapshot: ${asFile}`); process.exit(2); }
    if (j && j.kind === 'snapshot' && j.specs) return j;
    console.error('✗ arquivo não é um snapshot do speckit-graph (gere com `speckit-graph snapshot`).');
    process.exit(2);
  }
  return snapshotFromGitRef(fromArg, specsDir, src);
}

function cmdDiff(args) {
  const flags = args.flags;
  const specsDir = findSpecsDir(flags.specs);
  const src = flags.src ? path.resolve(flags.src) : null;
  const fromArg = (typeof flags.from === 'string' && flags.from) || args._[1];
  if (!fromArg) {
    console.error('✗ diff: informe a base com --from <snapshot.json | git-ref>');
    console.error('  ex.: speckit-graph diff --from HEAD~1     (compara com o commit anterior)');
    console.error('       speckit-graph diff --from base.json  (compara com um snapshot salvo)');
    process.exit(2);
  }
  const to = buildSnapshot(parseSpecs(specsDir, { src }));
  const from = resolveBaseSnapshot(fromArg, specsDir, src);
  const rep = diffReport(from, to);
  const project = flags.project || deriveProjectName(specsDir);
  const wantJson = 'json' in flags;
  const out = wantJson ? stringifyCanonical(rep) : diffMarkdown(rep, { project });
  const dest = (typeof flags.json === 'string' && flags.json) || (typeof flags.out === 'string' && flags.out) || null;
  if (dest) { fs.writeFileSync(path.resolve(dest), out); console.error(`✓ diff: ${path.resolve(dest)}`); }
  else console.log(out);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sub = args._[0];
  try {
    if (sub === 'init') return cmdInit(args.flags);
    if (sub === 'doctor' || args.flags.doctor) return cmdDoctor(args.flags);
    if (sub === 'check' || args.flags.check) return cmdCheck(args.flags);
    if (sub === 'summary' || 'summary' in args.flags) return cmdSummary(args.flags);
    if (sub === 'snapshot') return cmdSnapshot(args);
    if (sub === 'diff') return cmdDiff(args);
    if (sub === 'help' || args.flags.help) {
      console.log(`speckit-graph — diagramas interativos do SpecKit (dependências, casos de uso, arquitetura)

  speckit-graph [opções]        gera o HTML (3 abas)
    --specs <dir>   diretório de specs (default: ./specs autodetectado)
    --src <dir>     pasta de código p/ a aba Arquitetura (default: <raiz>/src)
                    use em monorepo p/ escopar só à feature (ex.: src/gov/rfb/consulta)
    --out <arquivo> saída (default: ./speckit-graph.html)
    --project <nome> nome exibido no cabeçalho
    --cdn           usa D3 via CDN em vez de embutir (arquivo menor, precisa de internet)
    --open          abre o HTML no navegador ao terminar
    --doctor        imprime o diagnóstico do plano (ciclos, FR órfã, tasks soltas…)
    --diff <base>   sobrepõe no grafo o que mudou desde a base (git-ref ou snapshot.json):
                    novo/concluído/alterado, com card lateral (toggle 🕒 diff)

  speckit-graph doctor [--specs <dir>] [--src <dir>] [--strict]
    diagnóstico determinístico do plano; --strict sai com código ≠0 se houver erro

  speckit-graph check [opções]   gate de CI: JSON canônico + exit code
    --json <arquivo>   grava o relatório JSON (default: stdout)
    --format md        emite Markdown p/ comentário de PR (em vez de JSON)
    --base-url <url>   URL do HTML publicado (links "ver" no Markdown)
    --gate <níveis>    severidades que reprovam (default: error; ex.: error,warn)
    --baseline <path>  reprova só em achados NOVOS vs. baseline (adoção gradual)
    --update-baseline  (re)grava o baseline com os achados atuais e sai 0
    exit: 0 passou · 1 reprovou · 2 erro de execução

  speckit-graph snapshot [arquivo] [--specs <dir>] [--src <dir>]
    grava um snapshot do plano (default: ./speckit-graph.snapshot.json)
    versione-o para comparar a evolução depois com o comando diff

  speckit-graph diff --from <snapshot.json | git-ref> [opções]
    compara a base (--from) com o plano atual: tasks novas/concluídas,
    mudanças de status/prioridade/deps e achados que surgiram/sumiram
    --from HEAD~1      compara com um commit (materializa os specs do ref)
    --from base.json   compara com um snapshot salvo
    --json [arquivo]   emite JSON canônico (default: Markdown no stdout)
    --out <arquivo>    grava a saída em arquivo

  speckit-graph init [--global] [--target <lista>]
    instala o comando /speckit-graph nas ferramentas de IA
    --target  claude,copilot,copilot-cli,kiro (default) | copilot-cli-agent (opcional)
    --global  instala no diretório do usuário (claude, kiro; copilot e copilot-cli são por-projeto)
`);
      return;
    }
    return cmdGenerate(args.flags);
  } catch (err) {
    console.error('✗ ' + err.message);
    process.exit(1);
  }
}

main();
