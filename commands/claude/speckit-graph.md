---
description: Gera e abre o grafo interativo de dependências/prioridades das tasks do SpecKit deste projeto.
---

# /speckit-graph

Gere o grafo interativo das tasks/RF do SpecKit deste projeto e abra no navegador.

Passos:

1. Descubra o diretório de specs do projeto (normalmente `specs/`, às vezes `project/specs/`).
   Se não existir nenhum `specs/*/tasks.md`, avise o usuário e pare.

2. Execute o gerador **speckit-graph** no terminal, na raiz do projeto. Tente nesta ordem e use o primeiro que funcionar:

   - Binário instalado localmente — PREFIRA este (gera direto, sem baixar nada):
     `speckit-graph --open`
     (ou, se `SPECKIT_GRAPH_HOME` apontar para um clone: `node "$SPECKIT_GRAPH_HOME/bin/cli.mjs" --open`)
   - Último recurso, só se não houver binário local (baixa do GitHub a cada execução):
     `npx --yes github:CristianonCarvalho/speckit-graph --open`

   Para instalar o binário local uma vez: `npm install -g github:CristianonCarvalho/speckit-graph`.
   Argumentos úteis: `--specs <dir>` para apontar os specs manualmente, `--out <arquivo>` para a saída, `--cdn` para não embutir o D3.

3. Reporte ao usuário o caminho do HTML gerado, quantas specs/tasks/dependências foram lidas e confirme que abriu.

Observações:
- O gerador é **determinístico** (não custa tokens) — ele apenas parseia os `tasks.md` e escreve o HTML.
- Ele **nunca** edita os arquivos de spec; só lê.
- O HTML é self-contained por padrão (abre offline / atrás de firewall).
