# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento
[SemVer](https://semver.org/lang/pt-BR/).

## [0.8.0] — 2026-08-14

**Renomeado: `speckit-graph` → `sdd-graph` (SDD-Graph).** O projeto deixa de ser
acoplado só ao SpecKit — passa a se chamar pela metodologia (*Spec-Driven
Development*), preparando terreno para outros adapters (BMad, Reversa — ver
[`docs/plano-sdd-graph.md`](docs/plano-sdd-graph.md)).

### Fundação (Fase 0)
- **Modelo canônico + registry de adapters** (`src/adapters/`): o parser do SpecKit foi
  encapsulado em `adapters/speckit.mjs`; `parseProject()` resolve o adapter aplicável
  (`--adapter`, autodetecção). Sem mudança de comportamento — só reempacotamento.

### Rename
- Pacote `sdd-graph` (bin `sdd-graph`, com **alias `speckit-graph`** — mesmo binário,
  aviso de deprecação ao ser invocado pelo nome antigo).
- Comando `/sdd-graph` em Claude Code, Copilot (VS Code + CLI) e Kiro; `init --keep-legacy`
  instala também o nome antigo durante a transição, `init --migrate` remove os arquivos
  antigos.
- Saída padrão passa a ser `sdd-graph.html` (com aviso se achar um `speckit-graph.html`
  antigo no diretório); título do HTML "Mapa SDD".
- `tool:` nos relatórios (`check`/`diff`/`snapshot`/`timeline`) e o marcador de
  comentário de PR passam a `sdd-graph`.
- Prefixo CSS `--sg-` **preservado** (agora lido como *SDD-Graph*); fingerprints e diffs
  independem do nome — baselines existentes continuam válidos.
- Repositório GitHub renomeado (`CristianonCarvalho/sdd-graph`); o nome antigo redireciona.

## [0.7.0] — 2026-08-14

Fecha a linha **Timeline** e amplia a cobertura de **arquitetura** e **legibilidade**.

### Timeline
- **Timeline multi-versão** (comando `timeline`) — evolução do plano ao longo de N
  pontos: `--last N` (commits que tocaram os specs) ou `--refs a,b,c`; progresso por
  ponto, concluídas/novas entre pontos e contagem de erros/avisos. Markdown (tabela +
  sparkline + acumulado) ou JSON canônico. Reusa `diffReport()` para os deltas.
- **Timeline visual no HTML** (`--timeline [N]`) — embute a evolução e mostra num painel
  📈: gráfico de progresso (área + linha em D3) + tabela por ponto.

### Arquitetura multi-linguagem
- Leitura de imports estendida a **TypeScript/JavaScript** (relativos + alias `@/`, `~/`,
  `src/`; `import`/`export from`, `require`, `import()` dinâmico; externos ignorados) e
  **Go** (imports sob o módulo do `go.mod`; `internal/`, `pkg/`, `cmd/` transparentes).
  Antes: só Python e Java.
- `walkFiles` passa a pular `node_modules`, `dist`, `build`, `out`, `target`, `vendor`, `.git`.

### Legibilidade
- **Layout Sugiyama** para grafos grandes (≥ 400 nós): nós fantasmas nas arestas que pulam
  camadas, minimização de cruzamentos por mediana e alinhamento; arestas longas roteadas
  pelas camadas. Abaixo do limite, o barycenter atual permanece (sem regressão). Custo
  imperceptível (o layout roda 1× por render).

### Infra
- Suíte com **39 testes** (novos: TS/JS e Go, timeline). Determinismo preservado.

## [0.6.0] — 2026-08-14

Consolida a linha **Diff/Timeline** e todo o trabalho das v0.2–v0.5 no primeiro
release marcado. Tudo determinístico (mesmo input → mesmos bytes), zero
dependências de runtime, HTML self-contained.

### Diff / Timeline
- Comando **`snapshot [arquivo]`** — grava um snapshot canônico do plano
  (status/prioridade/deps/frs das tasks, achados por `fingerprint`, progresso).
- Comando **`diff --from <snapshot.json | git-ref>`** — compara base→atual:
  tasks concluídas/novas/removidas, mudanças de status/prioridade/deps e achados
  do Doctor que surgiram/sumiram, + delta de progresso. Saída Markdown ou JSON
  canônico (`--json`). Git ref materializado via `git archive`.
- **Diff visual no HTML** (`--diff <base>`) — sobrepõe na aba Dependências um
  marcador por nó (🔵 nova · 🟢 concluída desde a base · 🟡 alterada), card lateral
  "Diff do plano" clicável, linha no detalhe e toggle **🕒 diff** (estado no permalink).

### Diagnóstico, foco e kanban (v0.5)
- **Diagnóstico sobreposto** — marcadores por severidade no grafo (erro/aviso/info),
  card lateral com a lista de achados e achados no painel de detalhe.
- **Foco na cadeia** — isola ancestrais + descendentes de uma task, com auto-zoom.
- **Kanban** — quadro read-only de 4 colunas (Concluídas / Em andamento / Prontas /
  Bloqueadas); a coluna Bloqueadas é calculada pelas dependências. Parser lê `[~]`
  como "em andamento".

### Leitura & navegação (v0.4)
- Minimapa de orientação, busca navegável (‹ ›, Enter, auto-zoom), métricas no
  detalhe (dependem/desbloqueiam) e tooltips.

### Enforcement (v0.2–v0.3)
- **Doctor** — 10 regras determinísticas (ciclos via Tarjan SCC, deps quebradas,
  FR órfã, story sem FR…), com ordenação canônica.
- **CI Gate** (`check`) — relatório JSON canônico + exit code, baseline com
  `fingerprint` estável (adoção gradual) e Markdown para comentário de PR.
- **Índice de confiança** 0–100 (4 dimensões, peso redistribuído) — badge no HTML,
  no `doctor` e no `check`.
- **Progresso** + "faça isto a seguir", **permalink** no `#hash`, **acessibilidade**
  (formas por prioridade, paleta Okabe-Ito, tema claro, `prefers-reduced-motion`) e
  **export** PNG/SVG.

### Arquitetura
- Leitura de imports **Python** (absolutos e relativos) e **Java** (pacote-base) para
  ligar cada serviço ao adapter/modelo real; heurístico por pastas como fallback.
  Normalização de nomes de camada EN + PT-BR. Monorepo via `--src`.

### Infra
- Suíte de **31 testes** (`node:test`, zero deps) rodando em CI (Node 18/20/22).
- Comando **`/speckit-graph`** instalável em Claude Code, GitHub Copilot (VS Code e CLI)
  e Kiro via `init`.

[0.8.0]: https://github.com/CristianonCarvalho/sdd-graph/releases/tag/v0.8.0
[0.7.0]: https://github.com/CristianonCarvalho/sdd-graph/releases/tag/v0.7.0
[0.6.0]: https://github.com/CristianonCarvalho/sdd-graph/releases/tag/v0.6.0
