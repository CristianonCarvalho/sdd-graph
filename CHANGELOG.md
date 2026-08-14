# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento
[SemVer](https://semver.org/lang/pt-BR/).

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

[0.6.0]: https://github.com/CristianonCarvalho/speckit-graph/releases/tag/v0.6.0
