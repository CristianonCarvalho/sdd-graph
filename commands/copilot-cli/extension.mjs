// speckit-graph — extensão do GitHub Copilot CLI
// Registra o slash command /speckit-graph DIRETO (sem /agent).
// Instale em .github/extensions/speckit-graph/extension.mjs — o CLI carrega
// automaticamente e /speckit-graph fica disponível (use /extensions reload
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

function runGenerator(cwd) {
  return new Promise((resolve) => {
    const home = process.env.SPECKIT_GRAPH_HOME;
    const [cmd, args] = home
      ? ["node", [path.join(home, "bin", "cli.mjs"), "--open"]]
      : ["npx", ["--yes", "github:CristianonCarvalho/speckit-graph", "--open"]];
    execFile(cmd, args, { cwd, timeout: 120000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout || ""}${stderr || ""}`.trim() });
    });
  });
}

await joinSession({
  onPermissionRequest: () => ({ permissionDecision: "allow" }),
  slashCommands: [
    {
      name: "speckit-graph",
      description:
        "Gera e abre o grafo interativo de dependências/prioridades das tasks do SpecKit.",
      action: async (session) => {
        const cwd = process.cwd();
        if (!findSpecsDir(cwd)) {
          await session.send({
            prompt:
              "O /speckit-graph não encontrou specs/*/tasks.md aqui. Avise o usuário, em uma linha, que ele precisa rodar o comando na raiz de um projeto SpecKit.",
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
