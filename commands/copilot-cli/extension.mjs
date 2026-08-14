// sdd-graph — extensão do GitHub Copilot CLI
// Registra o slash command /sdd-graph DIRETO (sem /agent).
// Instale em .github/extensions/sdd-graph/extension.mjs — o CLI carrega
// automaticamente e /sdd-graph fica disponível (use /extensions reload
// após editar). O @github/copilot-sdk é fornecido pelo runtime do CLI.
import { joinSession } from "@github/copilot-sdk";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function findSpecsDir(cwd) {
  for (const c of [path.join(cwd, "specs"), path.join(cwd, "project", "specs")]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// Ordem de preferência (gera DIRETO, sem baixar):
//   1) SDD_GRAPH_HOME (clone local)  2) binário instalado (global/npm link)
//   3) npx github (último recurso — baixa do GitHub a cada vez)
// speckit-graph (nome antigo) fica como fallback p/ quem ainda não atualizou.
function candidates() {
  const home = process.env.SDD_GRAPH_HOME || process.env.SPECKIT_GRAPH_HOME;
  const list = [];
  if (home) list.push(["node", [path.join(home, "bin", "cli.mjs"), "--open"]]);
  list.push(["sdd-graph", ["--open"]]);
  list.push(["speckit-graph", ["--open"]]); // alias/versões antigas
  list.push(["npx", ["--yes", "github:CristianonCarvalho/sdd-graph", "--open"]]);
  return list;
}

function tryRun(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 120000 }, (err, stdout, stderr) => {
      const out = `${stdout || ""}${stderr || ""}`.trim();
      // ENOENT = binário não existe nesta máquina → tenta o próximo candidato
      const missing = err && (err.code === "ENOENT");
      resolve({ ok: !err, missing, out });
    });
  });
}

async function runGenerator(cwd) {
  let last = { ok: false, out: "nenhum gerador disponível" };
  for (const [cmd, args] of candidates()) {
    const r = await tryRun(cmd, args, cwd);
    if (r.ok) return r;        // gerou com sucesso
    if (!r.missing) return r;  // existe mas falhou → reporta o erro real
    last = r;                  // não existe → tenta o próximo
  }
  return last;
}

await joinSession({
  onPermissionRequest: () => ({ permissionDecision: "allow" }),
  slashCommands: [
    {
      name: "sdd-graph",
      description:
        "Gera e abre o grafo interativo de dependências/prioridades das tasks do SpecKit.",
      action: async (session) => {
        const cwd = process.cwd();
        if (!findSpecsDir(cwd)) {
          await session.send({
            prompt:
              "O /sdd-graph não encontrou specs/*/tasks.md aqui. Avise o usuário, em uma linha, que ele precisa rodar o comando na raiz de um projeto SpecKit.",
          });
          return;
        }
        const r = await runGenerator(cwd);
        await session.send({
          prompt: r.ok
            ? `O grafo do SpecKit foi gerado e aberto no navegador. Saída do gerador:\n\n${r.out}\n\nApenas confirme isso ao usuário de forma breve.`
            : `Falha ao gerar o grafo do SpecKit:\n\n${r.out}\n\nExplique o erro ao usuário de forma breve e sugira verificar Node/acesso ao repositório.`,
        });
      },
    },
  ],
  tools: [],
  hooks: {},
});
