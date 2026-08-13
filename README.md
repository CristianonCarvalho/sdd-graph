# speckit-graph

Grafo interativo de **dependências e prioridades** das tasks/RF geradas pelo [SpecKit](https://github.com/github/spec-kit).
Lê os `specs/*/tasks.md` de um projeto e gera um HTML self-contained com:

- **Grafo dirigido em camadas** — as dependências fluem da fundação para as features.
- **Cor = prioridade** (P1/P2/P3, Setup, Fundação, Polish).
- **Tamanho do nó = quão bloqueante** (nº de tasks que dependem dele).
- **Caminho crítico** destacado e animado.
- Hover ilumina a cadeia de dependências; clique mostra descrição, FRs e pré-requisitos.
- Toggle entre múltiplos specs, filtro por prioridade e busca.

Zero dependências de runtime (Node ≥ 18). D3 embutido no HTML.

## Uso rápido

```bash
# a partir da raiz de um projeto SpecKit (que tenha specs/*/tasks.md)
npx --yes github:CristianonCarvalho/speckit-graph --open
```

Isso gera `speckit-graph.html` na raiz do projeto e abre no navegador.

### Opções

```
speckit-graph [opções]
  --specs <dir>     diretório de specs (default: ./specs autodetectado)
  --out <arquivo>   saída (default: ./speckit-graph.html)
  --project <nome>  nome exibido no cabeçalho
  --cdn             usa D3 via CDN (arquivo menor, precisa de internet)
  --open            abre o HTML no navegador ao terminar
```

## Comando /speckit-graph (Claude Code, GitHub Copilot e Kiro)

Instale o comando `/speckit-graph` nas três ferramentas de IA de uma vez:

```bash
npx --yes github:CristianonCarvalho/speckit-graph init
```

Isso instala, no projeto atual:

| Ferramenta | Arquivo instalado | Como invocar |
|---|---|---|
| **Claude Code** | `.claude/commands/speckit-graph.md` | `/speckit-graph` |
| **GitHub Copilot** (VS Code/JetBrains) | `.github/prompts/speckit-graph.prompt.md` | `/speckit-graph` |
| **GitHub Copilot CLI** | `.github/extensions/speckit-graph/extension.mjs` | `/speckit-graph` (direto) |
| **Kiro** | `.kiro/steering/speckit-graph.md` | `/speckit-graph` |

> **Copilot CLI:** o CLI não reconhece slash commands de `.github/prompts/`
> ([issue #618](https://github.com/github/copilot-cli/issues/618)). Para ter `/speckit-graph`
> **direto** (sem `/agent`), este projeto instala uma **extensão do Copilot CLI**
> (`.github/extensions/speckit-graph/extension.mjs`) que registra o slash command via
> `@github/copilot-sdk`. Requer o CLI instalado (`npm install -g @github/copilot`); rode
> `/extensions reload` se editar a extensão numa sessão aberta. As extensões são por-projeto.
>
> Alternativa: `init --target copilot-cli-agent` instala um **custom agent**
> (`.github/agents/…` ou, com `--global`, `~/.copilot/agents/`), acionado por `/agent`.

Opções:

```bash
npx --yes github:CristianonCarvalho/speckit-graph init --target kiro          # só uma
npx --yes github:CristianonCarvalho/speckit-graph init --target claude,kiro   # algumas
npx --yes github:CristianonCarvalho/speckit-graph init --target copilot-cli --global  # agente global do Copilot CLI
npx --yes github:CristianonCarvalho/speckit-graph init --global               # ~/.claude, ~/.kiro, ~/.copilot/agents
```

## Desenvolvimento local

```bash
git clone <repo> && cd speckit-graph
npm link                       # disponibiliza o binário `speckit-graph`
# ou aponte o comando para o checkout:
export SPECKIT_GRAPH_HOME=/caminho/para/speckit-graph
```

## Como o parser entende o SpecKit

- Fases (`## Phase N: ...`) definem a user story e a prioridade (`Priority: P1`).
- Fases sem story viram `SETUP` / `FOUND` (Foundational) / `POLISH`.
- Tasks: `- [ ] T001 [P] descrição...` → `[X]` = concluída, `[P]` = paralelizável.
- Dependências: qualquer `depende de T003`, ranges `T008–T013` e listas `T020, T031`.
- Requisitos: qualquer `FR-XXX` citado na descrição.

Nunca escreve nos arquivos de spec — apenas lê.
