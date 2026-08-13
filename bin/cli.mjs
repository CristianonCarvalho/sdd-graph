#!/usr/bin/env node
// speckit-graph — CLI
// Uso:
//   speckit-graph [--specs <dir>] [--out <arquivo>] [--cdn] [--open] [--project <nome>]
//   speckit-graph init [--global]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parseSpecs } from '../src/parse.mjs';
import { renderHTML } from '../src/template.mjs';

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
    const { diagnostics } = data[slug];
    const c = diagnostics.counts;
    totalError += c.error;
    console.log(`\n🔎 ${slug} — ${c.error} erro(s), ${c.warn} aviso(s), ${c.info} info`);
    if (!diagnostics.findings.length) { console.log('   ✓ nenhum problema encontrado.'); continue; }
    for (const f of diagnostics.findings) {
      console.log(`   ${SEV_ICON[f.severity]} [${f.id}] ${f.message}`);
    }
  }
  console.log('');
  // --doctor apenas relata; o exit code faz parte do futuro CI Gate (--check).
  if (flags.strict && totalError > 0) process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sub = args._[0];
  try {
    if (sub === 'init') return cmdInit(args.flags);
    if (sub === 'doctor' || args.flags.doctor) return cmdDoctor(args.flags);
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

  speckit-graph doctor [--specs <dir>] [--src <dir>] [--strict]
    diagnóstico determinístico do plano; --strict sai com código ≠0 se houver erro

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
