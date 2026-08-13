---
mode: 'agent'
description: 'Gera e abre o grafo interativo de dependências/prioridades das tasks do SpecKit deste projeto.'
---

# /speckit-graph

Gere o grafo interativo das tasks/RF do SpecKit deste projeto e abra no navegador.

Passos:

1. Descubra o diretório de specs do projeto (normalmente `specs/`, às vezes `project/specs/`).
   Se não existir nenhum `specs/*/tasks.md`, avise o usuário e pare.

2. Execute o gerador **speckit-graph** no terminal, na raiz do projeto. Tente nesta ordem e use o primeiro que funcionar:

   - Se a variável `SPECKIT_GRAPH_HOME` estiver definida:
     `node "$SPECKIT_GRAPH_HOME/bin/cli.mjs" --open`
   - Via repositório GitHub:
     `npx --yes github:CristianonCarvalho/speckit-graph --open`
   - Binário global (se instalado com `npm link`):
     `speckit-graph --open`

   Argumentos úteis: `--specs <dir>` para apontar os specs manualmente, `--out <arquivo>` para o caminho de saída, `--cdn` para não embutir o D3.

3. Reporte ao usuário o caminho do HTML gerado, quantas specs/tasks/dependências foram lidas e confirme que abriu.

Observações:
- O gerador é **determinístico** — ele apenas parseia os `tasks.md` e escreve o HTML.
- Ele **nunca** edita os arquivos de spec; só lê.
- O HTML é self-contained por padrão (abre offline / atrás de firewall).
