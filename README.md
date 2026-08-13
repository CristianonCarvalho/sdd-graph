# speckit-graph

Diagramas interativos dos artefatos do [SpecKit](https://github.com/github/spec-kit).
Lê `specs/*/` de um projeto e gera **um HTML self-contained com 3 abas**:

- **Dependências** — grafo dirigido em camadas das tasks: cor = prioridade (P1/P2/P3, Setup, Fundação, Polish), tamanho = quão bloqueante, **caminho crítico** animado. Barra de **progresso** (geral e por prioridade, lida dos checkboxes `- [x]`) e painel **"faça isto a seguir"** com as tasks já desbloqueadas (todas as dependências concluídas); concluídas ganham anel verde, prontas ganham anel âmbar.
- **Casos de uso** — ator → casos de uso (user stories do `spec.md`, cor por prioridade) → requisitos (FR) que cada um cobre.
- **Arquitetura** — componentes e fluxo (Web UI → API → Serviços → integrações/modelos → sistemas externos e banco). Se houver código **Python ou Java** em `src/`, **lê os `import`s** (absolutos e **relativos** em Python, ex.: `from ..integrations.binance import ...`) e liga cada serviço ao adapter/modelo real (preciso); senão, deriva das pastas + `plan.md` (heurístico). O subtítulo indica qual dos dois. Nomes de camada variados são normalizados (EN + **PT-BR**: service/servico, controller/controle, repository/repositorio, gateway/integracao…). **Monorepo:** use `--src <pasta-da-feature>` para escopar a varredura, senão o pacote-base fica genérico demais e a arquitetura não é reconhecida.

Comum às três: hover ilumina a cadeia, clique abre o detalhe (com **métricas**: quantas tasks dependem/desbloqueiam), tooltip no nó, filtro por prioridade, toggle entre specs, **minimapa** de orientação e **busca** com contador, ‹ › e auto-zoom ao resultado (Enter). **Permalink** (estado da visão no `#hash`, botão "🔗 link"). **Acessibilidade:** forma do nó por prioridade (duplo canal, não só cor), paleta segura para daltonismo (Okabe-Ito), tema claro + modo de impressão, e respeito a `prefers-reduced-motion`.

Fontes lidas (somente leitura, nunca escreve): `tasks.md` (dependências), `spec.md` (casos de uso e texto dos FRs), `plan.md` (stack), e — quando existir — `src/**/*.py` ou `src/**/*.java` (acoplamento real na aba Arquitetura).

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
  --src <dir>       pasta de código p/ a aba Arquitetura (default: <raiz>/src);
                    em monorepo, aponte só à feature (ex.: src/gov/rfb/consulta)
  --out <arquivo>   saída (default: ./speckit-graph.html)
  --project <nome>  nome exibido no cabeçalho
  --cdn             usa D3 via CDN (arquivo menor, precisa de internet)
  --open            abre o HTML no navegador ao terminar
  --doctor          imprime o diagnóstico do plano (ver abaixo)
```

## Doctor — diagnóstico determinístico do plano

Um "linter" do plano SpecKit: roda sobre o que já é lido e aponta problemas de planejamento, de forma reproduzível (mesmo input → mesma saída), sem rede nem escrita.

```bash
speckit-graph doctor            # relatório humano
speckit-graph doctor --strict   # sai com código ≠0 se houver erro (para CI)
speckit-graph --doctor          # mesmo relatório junto do fluxo normal
```

Regras (id · severidade):

| Severidade | Regras |
|---|---|
| **Erro** | `CYCLE` (ciclo de dependência, com a aresta que quebra) · `DEP_UNKNOWN` (depende de ID inexistente) · `SELF_DEP` (depende de si mesma) · `DUP_TASK_ID` (ID repetido) |
| **Aviso** | `TASK_NO_PRIORITY` · `TASK_NO_STORY` · `FR_ORPHAN` (FR não citado por nenhuma task) · `STORY_NO_FR` (user story sem FR) |
| **Info** | `CODE_ORPHAN` (módulo em `src/` sem task que o cite — heurístico) |

O diagnóstico também é embutido no HTML (`diagnostics`) para uso futuro na sobreposição visual.

### Índice de confiança

Cada spec recebe um **índice de confiança (0–100)** — uma leitura honesta de "quanto confiar neste grafo", determinística. Aparece como badge no HTML, no `doctor` e no JSON do `check` (`confidenceIndex`). Combina 4 dimensões (peso redistribuído quando uma não se aplica):

- **task** — parsing das tasks (linhas casadas vs. malformadas)
- **dep** — resolução das dependências (válidas vs. quebradas/auto-referência)
- **arch** — derivação da arquitetura: lida do código (100%) · base ambígua (75%) · heurística (50%)
- **import** — resolução dos imports do código: absoluto exato · relativo inferido (crédito parcial) · não resolvido

Ex.: um monorepo sem `--src` cai a ~81% (arquitetura heurística); com `--src` na feature sobe a 100%.

## CI Gate — `check` (exit code + JSON)

Embrulha o Doctor para o pipeline: relatório **JSON canônico** (determinístico) e **exit code** para reprovar o merge quando o plano tem problemas.

```bash
speckit-graph check                       # JSON no stdout; exit 1 se houver erro
speckit-graph check --json report.json    # grava o JSON
speckit-graph check --gate error,warn     # também reprova em avisos
```

Exit: `0` passou · `1` reprovou · `2` erro de execução.

### Export & resumo

```bash
speckit-graph summary               # resumo Markdown no stdout (p/ PR/issue/ata)
speckit-graph --summary resumo.md   # grava em arquivo
```

O resumo (determinístico) traz progresso, caminho crítico, gargalos, próximas tasks desbloqueáveis, achados do Doctor e o índice de confiança. No HTML, os botões **⬇ PNG** e **⬇ SVG** exportam a visão atual (respeitando aba, filtros, zoom e tema) — serialização nativa, sem libs.

**Adoção gradual (baseline)** — para um plano legado que já tem problemas, aceite o estado atual e passe a reprovar só no que for **novo**:

```bash
speckit-graph check --baseline sg.baseline.json --update-baseline   # aceita o legado
git add sg.baseline.json                                            # versione
speckit-graph check --baseline sg.baseline.json                     # reprova só regressões novas
```

Cada achado tem um `fingerprint` estável (independe de ordem/posição). Workflow de exemplo do GitHub Actions em [`examples/github/speckit-graph.yml`](examples/github/speckit-graph.yml).

**Comentário de PR** — `check --format md` emite Markdown (tabela de achados com links para a visão exata) para postar como comentário fixo no PR:

```bash
speckit-graph check --format md --base-url https://ci.exemplo/speckit-graph.html
```

O Markdown traz um marcador `<!-- speckit-graph -->` para o comentário ser atualizado (não duplicado) a cada push.

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
