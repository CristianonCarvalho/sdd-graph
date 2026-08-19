# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento
[SemVer](https://semver.org/lang/pt-BR/).

## [0.10.1] — 2026-08-19

**Robustez do adapter SpecKit contra o formato oficial atual e CRLF.** Dois problemas reais
reportados pelo usuário, confirmados contra a fonte oficial (`github/spec-kit`) e contra
arquivos reais gerados por ele.

### CRLF (Windows) quebrava o parser silenciosamente
- `readText()` (novo, `src/parse.mjs`, exportado) normaliza `\r\n`/`\r` → `\n` antes de
  qualquer parsing — regexes ancoradas em `$` sem `\s*` antes exigiam fim de linha exato e
  falhavam mudas com `\r` residual (`tasks.md` inteiro virava 0 tasks, sem erro).
  Aplicado em toda leitura de `tasks.md`/`spec.md`/`plan.md` e nos scanners de
  código-fonte (Python/Java/JS/Go); `reversa.mjs`/`tlc.mjs` passam a reusar o mesmo helper.

### Grafo "vertical sem dependências" — anotação inline nunca foi exigida pelo spec-kit
- Confirmado ao vivo contra `templates/tasks-template.md` e `templates/commands/tasks.md`
  do `github/spec-kit`: a anotação `(depends on Txxx)` por task **nunca foi um requisito**
  da geração oficial — só decoração de um exemplo. A ordenação real e estável é
  estrutural: fases sempre sequenciais + marcador `[P]` ("no dependencies on incomplete
  tasks"). `parseTasksFile` agora infere a dependência quando a task não declara nenhuma
  (1ª task/`[P]` de cada fase ganha gate completo na fase anterior; as demais encadeiam na
  task anterior do arquivo) — nunca sobrescreve deps explícitas.
- Cada aresta inferida é marcada (`depsInferred`) e recebe crédito parcial (0.7) no índice
  de confiança (`src/confidence.mjs`), mesmo tratamento já dado a imports relativos —
  honesto, não finge certeza que a fonte não deu.
- `parseTaskDeps` bilíngue: reconhece `depends on`/`depend on` (EN) além de `depende de`
  (PT) — o próprio exemplo oficial usa inglês. `parseSpecMd` idem para extração de ator
  (`As a/an X,` além de `Como X,`).
- **Casos-limite corrigidos após revisão** (`revisor-sdd-graph`): fase sem tasks entre dois
  headings não apagava mais a cadeia de fan-in para a fase seguinte; dependência explícita
  "pra frente" (cruzando fases) podia fazer a inferência inventar um `CYCLE` falso — agora
  excluída do fan-in/encadeamento de quem ela cita. `computeConfidence` ganhou uma trava
  defensiva (`inferred` nunca conta mais que `resolved`).
- Testes: 7 novos (75/75).

## [0.10.0] — 2026-08-18

**Terceiro adapter SDD: tlc-spec-driven** (catálogo tech-leads-club/agent-skills) — fora
da ordem original do roadmap, mesmo critério do Reversa: formato confirmado **verbatim**
direto no `SKILL.md`/`references/specify.md`/`references/tasks.md` da skill, que ainda por
cima valida a própria estrutura por código (`validate_spec.py`, `validate_tasks.py`).

### Adapter tlc-spec-driven (`src/adapters/tlc.mjs`)
- Lê `.specs/features/<feature>/spec.md` (user stories `P1`/`P2`/`P3`, tabela de
  *Requirement Traceability*) e `tasks.md` (task breakdown, `**Depends on**`,
  `**Requirement**`, checklist `**Done when**`).
- Prioridade e story da task vêm do **Requirement** citado (busca na tabela de
  traceability), não da fase — as fases do tlc são só organizacionais, diferente do
  Reversa. Task sem `Requirement` fica com prioridade/story `null` (honesto).
- Status: `done` quando todo o checklist "Done when" está `[x]`; `inProgress` quando só
  parte está.
- Arquitetura via heurístico existente, alimentada pelo campo "Where" de cada task.
- Escopo desta versão: só `spec.md` + `tasks.md`. `design.md`/`context.md`/
  `validation.md`/`.specs/STATE.md` ficam de fora (texto livre ou nível de projeto, não de
  unidade) — ver `docs/plano-sdd-graph.md` B.6.2.
- **Reusa 100% do núcleo sem código novo**: Doctor, índice de confiança, gate, diff,
  timeline e o HTML funcionam sem alteração.

### Infra
- Testes: 10 novos (64/64), incluindo fixture realista (moldada nos templates reais da
  skill) e verificação de que Doctor/confiança/arquitetura funcionam para a 3ª fonte sem
  mudança em `doctor.mjs`/`confidence.mjs`/`parse.mjs`.

## [0.9.0] — 2026-08-14

**Segundo adapter SDD: Reversa** (github.com/sandeco/reversa) — ordem do roadmap
invertida em relação ao planejado: o adapter BMad foi adiado porque o BMAD-METHOD
lançou uma reestruturação grande (v6.11.0, 5 dias antes) trocando `docs/stories/*.md`
por um contrato `stories.yaml`; o Reversa entrou primeiro porque seu formato foi
confirmado **verbatim** contra os templates reais do projeto fonte.

### Adapter Reversa (`src/adapters/reversa.mjs`)
- Lê o pipeline **forward**: `_reversa_forward/<slug>/actions.md` (tasks — ids `T###`,
  dependências, marcador de paralelismo `[//]`, status `[ ]`/`[X]`) e `requirements.md`
  (requisitos `RF-##` com prioridade MoSCoW, personas → casos de uso).
- Prioridade de task: da **fase** (Preparação→SETUP, Polimento→POLISH) ou **herdada** do
  MoSCoW do RF citado (Must→P1, Should→P2, Could→P3) quando a fase não define uma.
- Arquitetura via heurístico existente, alimentado pelo caminho real de "Arquivo alvo".
- **Reusa 100% do núcleo sem código novo**: Doctor, índice de confiança, gate, diff,
  timeline e o HTML funcionam sem alteração — confirma a arquitetura de adapters da
  Fase 0.
- Lado **reverse** (`_reversa_sdd/`: C4, ERD, arquitetura nativa) fica de fora desta
  versão — é texto livre gerado por IA, sem template fixo confirmado no repositório.

### Coexistência de múltiplas fontes (B.9)
- `parseProject()` agora **agrega** todas as fontes detectadas no mesmo projeto; com mais
  de uma, os slugs ganham **namespacing `fonte:slug`** (ex.: `speckit:001-x`,
  `reversa:001-y`) — evita colisão de id/permalink/fingerprint. Com uma fonte só (caso
  comum), comportamento idêntico a antes.

### Infra
- `buildArchHeuristic` exportado de `parse.mjs` para reuso por adapters.
- Testes: 10 novos (54/54), incluindo fixture real (baseada nos templates oficiais) e
  smoke test de coexistência SpecKit+Reversa.

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

[0.9.0]: https://github.com/CristianonCarvalho/sdd-graph/releases/tag/v0.9.0
[0.8.0]: https://github.com/CristianonCarvalho/sdd-graph/releases/tag/v0.8.0
[0.7.0]: https://github.com/CristianonCarvalho/sdd-graph/releases/tag/v0.7.0
[0.6.0]: https://github.com/CristianonCarvalho/sdd-graph/releases/tag/v0.6.0
