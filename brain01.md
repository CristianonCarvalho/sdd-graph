# brain01 — Brainstorm de evolução do speckit-graph

> Sessão de brainstorm multi-agente para evoluir a ferramenta **speckit-graph** (diagramas
> interativos de projetos SpecKit: dependências, casos de uso e arquitetura).
> **Método:** 3 agentes com contextos distintos · 5 rodadas de discussão · síntese pelo orquestrador.
> **Natureza:** documento de ideação — nada aqui está implementado; são propostas priorizadas.

---

## Participantes (personas)

| | Persona | Lente |
|---|---|---|
| **Ana** | DevEx / Produto (usa spec-driven dev diariamente com vários times) | adoção, workflow, integração ao ciclo do SpecKit, colaboração, valor percebido |
| **Bruno** | Staff engineer de análise estática / grafos | profundidade e corretude de parsing, multi-linguagem, escala em monorepo, métricas, determinismo, CI |
| **Célia** | Design de informação / dataviz e acessibilidade | legibilidade, interação, layout, contraste, daltonismo, storytelling, export |

## Método — as 5 rodadas

1. **Ideação divergente** — cada persona propôs 6–8 ideias sob sua lente (24 no total).
2. **Crítica cruzada** — cada uma viu todas as ideias, apontou fusões, criticou as fracas e propôs híbridas.
3. **Viabilidade** — pontuação Impacto × Esforço e classificação (quick win / aposta / armadilha).
4. **Design concreto** — detalhamento técnico das vencedoras por área (flags, arquivos, schema, algoritmo).
5. **Consolidação** — roadmap em fases, north star e princípios-guarda.

---

## Sumário executivo

- **Convergência central:** o **Doctor** (diagnóstico determinístico do plano) é o pivô do roadmap — quase metade das outras ideias depende dele. Transforma a ferramenta de "visualizador bonito" em "verificador confiável".
- **North star sintetizada:** *o painel vivo, honesto e confiável do plano SpecKit — que responde "o que pego agora, o que está errado e o que mudou", offline, sem instalar nada e sem servidor.*
- **Quick wins de maior consenso:** #1 Doctor · #14 Índice de confiança · #6 Progresso/desbloqueáveis · #8 Acessibilidade · #9 Deep-link · #4 Export+`--summary` · #2 CI Gate.
- **Apostas grandes (sequenciar):** #10 Legibilidade+minimapa · #12 Robustez de imports · #3 Diff/Timeline · #17 Diagnóstico sobreposto · #7 Métricas · #15 Foco · #16 Standup.
- **Armadilhas (adiar):** #13 Multi-linguagem (escopo/zero-deps) · #11 Layout Sugiyama (risco de determinismo → contamina o Diff).
- **"Se fizer só uma coisa":** votos divididos entre **#1 Doctor** (Bruno), **#6 Progresso** (Ana) e **#8 Acessibilidade** (Célia) — todos na v0.2. **Recomendação do orquestrador:** começar pelo **Doctor (#1)** (maior alavancagem, baixo esforço), emparelhado com **#6**.

---

## Rodada 1 — Catálogo das 24 ideias

### Ana (DevEx)
- **A1 Watch/auto-reload** — `--watch` regenera ao salvar (fs.watch nativo). *Esforço baixo.*
- **A2 Diff visual entre versões** — `--since HEAD~10`, destaca o que mudou no plano. *Médio.*
- **A3 Progresso% + próximas tasks desbloqueáveis** — "o que pego agora?" a partir dos checkboxes. *Baixo.*
- **A4 Deep-link/permalink** — estado da UI no hash; "copiar link desta view". *Baixo.*
- **A5 Onboarding tour + `--demo`** — dataset fictício embutido + overlay guiado. *Médio.*
- **A6 Export PNG/SVG + `--summary` Markdown** — vaza o valor para PR/Slack/ata. *Médio.*
- **A7 Linter de saúde da spec** — ciclos, FR sem task, task sem story, órfãos. *Médio.*
- **A8 Gate de CI + artefato** — `--check` com exit code; publica HTML por PR. *Médio.*

### Bruno (análise)
- **B1 Detecção de ciclos + aresta que quebra** — SCC no DAG; mostra o corte mínimo. *Baixo.*
- **B2 Métricas de grafo** — fan-in/out, alcance transitivo, betweenness → score de gargalo. *Médio.*
- **B3 Validador specs↔código** — FR órfã, task sem FR, módulo `src/` sem task. *Médio.*
- **B4 Robustez pacote-base + imports** — multi-raiz, relativos Python, re-exports. *Médio.*
- **B5 Diff `--compare <ref>`** — grafo temporal (added/removed/reprioritizado). *Alto.*
- **B6 Novas linguagens (TS/JS, Go)** — mesmo pipeline serviço→adapter/modelo. *Médio.*
- **B7 Camada de confiança + diagnósticos** — nível de confiança por aresta; linhas não parseadas. *Baixo.*
- **B8 Modo CI `--check`** — exit code + relatório JSON quando regras falham. *Baixo.*

### Célia (dataviz/UX)
- **C1 Layout Sugiyama refinado** — mediana + varreduras + roteamento ortogonal (menos cruzamentos). *Alto.*
- **C2 Colapso/expansão por grupo** — supernós por fase/épico; feixes de arestas agregadas. *Médio.*
- **C3 Minimapa + lente fisheye** — orientação em zoom alto + detalhe local. *Médio.*
- **C4 Acessibilidade cromática** — paletas daltonismo, duplo canal (cor+forma/ícone), contraste AA. *Médio.*
- **C5 Modo claro / impressão** — tema claro, `@media print`, alto contraste. *Baixo.*
- **C6 Export SVG/PNG do visível** — serializa o SVG atual respeitando filtros/zoom. *Médio.*
- **C7 Tour guiado do caminho crítico** — narra nó a nó "o que bloqueia o quê". *Médio.*
- **C8 Legibilidade de rótulos + busca** — anticolisão/elipse/tooltip; busca com realce e auto-zoom. *Baixo/médio.*

---

## Rodada 2 — Fusões e ideias híbridas

**Fusões consolidadas** (24 ideias → ~17):

| Fusão | Combina | Vira |
|---|---|---|
| **Doctor** (diagnóstico) | A7 + B1 + B3 + B7 | motor único de regras tipadas (severidade + confiança) |
| **CI Gate** | A8 + B8 | `--check` = exit code + JSON + artefato; consome o Doctor |
| **Diff / Timeline** | A2 + B5 | um motor de diff, duas entradas (git ref ou pasta) |
| **Export & Share** | A6 + C6 | SVG/PNG do visível + `--summary` Markdown |
| **First Run / Tour** | A5 + C7 | sistema de tour, dois roteiros (demo + caminho crítico) |
| **Legibilidade + navegação** | C3 + C8 | achar e ler (minimapa/busca/auto-zoom/rótulos limpos) |

**Híbridas novas propostas:**
- **H-Ana1 Doctor-as-PR-comment** — Doctor + CI Gate + `--summary`: comentário determinístico no PR com links para a view exata.
- **H-Ana2 Standup view** — Progresso + Diff + score de nó: tela pronta para daily (concluído/desbloqueado/bloqueando).
- **H-Bruno1 Gate incremental com baseline** — falha só em regressões novas (adoção sem travar backlog legado).
- **H-Bruno2 Diff sem ruído de layout** — match por ID estável + layout congelado (resolve o risco do Sugiyama contaminar o diff).
- **H-Bruno3 Índice de confiança (0–100)** — % parseado exato vs heurístico; badge no HTML e campo no JSON.
- **H-Célia1 Diagnóstico visual sobreposto** — achados do Doctor viram badges clicáveis no próprio nó/aresta.
- **H-Célia2 Foco numa task** — sub-visão: ancestrais (bloqueiam) + descendentes (libera) + métricas + status.

**Alertas de risco levantados:** git no diff (ameaça determinismo/offline) · Sugiyama (desempate instável entre versões de Node) · multi-linguagem (escopo/zero-deps).

---

## Rodada 3 — Ranking Impacto × Esforço (médias das 3 lentes)

Escala 1–5. Classe: **QW** quick win · **BB** aposta grande · **NN** nice-to-have · **TR** armadilha.

| # | Ideia | Impacto | Esforço | Classe |
|---|---|:---:|:---:|:---:|
| 1 | Doctor (diagnóstico determinístico) | 5.0 | 2.3 | **QW★** (fundação) |
| 2 | CI Gate (`--check` + baseline) | 4.7 | 2.0 | **QW** |
| 6 | Progresso% + desbloqueáveis | 4.7 | 2.0 | **QW** |
| 8 | Acessibilidade + modo claro/print | 4.3 | 2.3 | **QW** |
| 10 | Legibilidade + minimapa + busca | 4.3 | 3.0 | **BB** |
| 4 | Export & Share (+`--summary`) | 4.0 | 2.3 | **QW** |
| 14 | Índice de confiança | 4.0 | 2.0 | **QW** |
| 15 | Foco numa task | 4.0 | 2.3 | QW/BB |
| 17 | Diagnóstico visual sobreposto | 4.0 | 3.0 | **BB** |
| 3 | Diff / Timeline | 4.0 | 4.0 | **BB** |
| 7 | Métricas de grafo | 3.7 | 3.0 | BB |
| 12 | Robustez pacote-base / imports | 3.7 | 3.0 | **BB** |
| 16 | Standup view | 3.7 | 2.3 | QW/BB |
| 9 | Deep-link / permalink | 3.3 | 1.3 | **QW** (mais barato) |
| 5 | First Run / Tour | 2.7 | 2.7 | NN |
| 11 | Layout Sugiyama | 3.7 | 4.7 | **TR** (adiar) |
| 13 | Multi-linguagem (TS/JS, Go) | 3.3 | 4.7 | **TR** (adiar) |

**Quick wins apontados para fazer já:** #1, #2, #6, #8, #9, #14, #4.
**Armadilhas unânimes:** #13 Multi-linguagem, #11 Sugiyama.

---

## Rodada 4 — Design concreto (destaques)

> Arquivos-chave: `bin/cli.mjs` (CLI), `src/parse.mjs` (parsers + scan de imports), `src/template.html` (UI/D3),
> `src/template.mjs` (injeção). Dados por spec hoje: `{tasks, usecases, actors, frText, arch}`.

### Núcleo de corretude (Bruno)

**#1 Doctor** — novo `src/doctor.mjs` (puro). Adiciona `diagnostics:{findings[],counts}` ao spec.
`Finding = {id, severity, targetKind, targetId, message, confidence}`. Regras (id·severidade):
`CYCLE·error`, `DEP_UNKNOWN·error`, `SELF_DEP·error`, `DUP_TASK_ID·error`, `TASK_NO_PRIORITY·warn`,
`TASK_NO_STORY·warn`, `FR_ORPHAN·warn`, `STORY_NO_FR·warn`, `CODE_ORPHAN·info`, `PARSE_UNMATCHED·info`.
Ordenação canônica `(severity, id, targetId)`. Ciclos via **Tarjan iterativo** (ordem por ID → corte determinístico).

**#2 CI Gate** — `--check`, `--json <path>`, `--baseline <path>`, `--gate <regras>`; novo `src/gate.mjs`.
JSON com `schemaVersion`, `summary{error,warn,info,confidenceIndex}`, `findings[]`, `graph{...,cyclic}`,
`baseline{newFindings,resolved}`. Exit: `0` ok / `1` violação / `2` erro fatal. Baseline por
`fingerprint = hash(id+targetKind+targetId)` (FNV/djb2 embutido). **Sem timestamp** no payload (determinismo).

**#14 Índice de confiança** — `src/confidence.mjs`. Insumos de proveniência do parser:
`r_task, r_dep, r_import, r_base`; pesos `.35/.25/.30/.10`, redistribuídos se uma dimensão não existe;
`Math.round` para estabilidade. Vira badge no HTML e `summary.confidenceIndex` no JSON.

**#12 Robustez de imports** — refatorar scanner em `src/imports/{python,java}.mjs` + `resolve.mjs`;
`--roots a,b`. Multi-raiz por marcador (`__init__.py`, `pom.xml`, `go.mod`…), relativos Python (`from ..x`),
`__init__` re-exports (1 nível). Cada aresta ganha `provenance: import-exact|import-inferred|folder-heuristic`
e imports não resolvidos aparecem **rotulados**, nunca descartados/chutados.

**#3 Diff/Timeline** — `--compare <ref|dir>`, `--since <ref>`; `src/diff.mjs`. Match por **ID de task/FR**
(sem heurística de similaridade); `changed` = diff de priority/deps(set)/story/FR. **Layout congelado** no
estado novo; `removed` entram como fantasmas. Git opcional via `child_process` só-leitura, com fallback
para diretório quando git ausente.

### Fluxo e colaboração (Ana)

**#6 Progresso/desbloqueáveis** — `status:'done'|'todo'` do checkbox `- [x]`; `unblocked[]` (todo com deps done).
Barra de progresso segmentada por prioridade + painel "Faça isto a seguir" (clique centraliza o nó).

**#9 Deep-link** — router de hash puro: `#tab=deps&task=T012&focus=1&hide=done&q=auth`; `history.replaceState`;
botão "copiar link". Robusto a chaves ausentes/desconhecidas.

**#4 Export & `--summary`** — Export SVG (serializa `<svg>`) + PNG (canvas `toBlob`), sem libs. `src/summary.mjs`
gera Markdown determinístico: Progresso · Caminho crítico · Gargalos · Próximas desbloqueáveis · Doctor · Confiança.

**#16 Standup view** — `--standup` (ou `#standup=1&since=HEAD~1`): 3 colunas (concluído desde ref / desbloqueado
agora / bloqueando mais gente), cada item é permalink. Sem git, "concluído desde" degrada com aviso.

**H-Ana1 Doctor-as-PR-comment** — `--check --format md`; tabela idempotente (atualiza, não duplica) com
severidade + link para a view exata do HTML publicado.

### Leitura e visual (Célia)

**#8 Acessibilidade** — **duplo canal por prioridade via forma** (losango/triângulo/quadrado/círculo) + ícone;
arestas por tipo (cheia/tracejada/marching-ants); paletas `data-palette` (deuteranopia/tritanopia/mono) trocando
`--c-*`/`--k-*`; tokens recalibrados p/ **AA** (verde só em fill, nunca texto fino); `[data-theme=light]` +
`@media print` (congela animação, legenda por extenso); respeita `prefers-reduced-motion`.

**#10 Legibilidade + minimapa + busca** — medição real de texto + elipse + tooltip; **anticolisão AABB** com
leader lines + halo; **minimapa** 160×120 com retângulo de viewport arrastável; busca com realce, contador
"3/12" e **auto-zoom** (600ms) ao resultado; declutter de rótulos por escala.

**#17 Diagnóstico sobreposto** — camada `<g class="sg-diagnostics">`: cada finding do Doctor vira badge
(ícone+cor+forma por severidade) no nó/aresta; ciclo com "tesoura" na aresta de corte; botão "Próximo problema"
(atalho `n`) percorre por severidade com auto-zoom. **Só render, zero reanálise.**

**#15 Foco numa task** — BFS de ancestrais+descendentes; sub-layout de 3 faixas (bloqueadores·task·liberadas);
painel com métricas (#7) e status (#6); breadcrumb "sair do foco"; clique encadeia o foco.

---

## Rodada 5 — Roadmaps propostos

### Roadmap de Ana (fluxo-primeiro)
- **v0.2 Fluxo diário:** #6, #9, #4, #14
- **v0.3 Doctor:** #1, #8, #2, PR-comment
- **v0.4 Legibilidade e navegação:** #10, #7, #15, #17
- **v0.5+ Colaboração no tempo:** #16, #3, #12 → depois #11 → por fim #13

### Roadmap de Bruno (corretude-primeiro)
- **v0.2 Fundação de corretude:** #1, #14, #8
- **v0.3 Enforcement e proveniência:** #2, #12
- **v0.4 Tempo e leitura operacional:** #3, #6, #16, #17
- **v0.5+ Métricas, foco e alcance:** #7, #15, #10, #4, #9, #5 → #13 → #11

### Roadmap de Célia (leitura-primeiro)
- **v0.2 Confiar e ler:** #1, #14, #8, #9
- **v0.3 Navegar e agir:** #10, #6, #4, #2
- **v0.4 Diagnosticar e focar:** #17, #7, #15, #16
- **v0.5+ Tempo e escala:** #3, #12, #5 → adiados #11, #13

### North stars
- **Ana:** o painel vivo e confiável do plano SpecKit — "o que pego agora, o que está errado, o que mudou" — em qualquer lugar, sem custo e sem servidor.
- **Bruno:** um grafo em que cada nó e aresta são verdadeiros ou honestamente marcados como incertos — nunca um chute apresentado como fato.
- **Célia:** ler um plano SpecKit inteiro e saber, em segundos e por qualquer pessoa, o que está pronto, o que bloqueia e no que confiar — offline, sem instalar nada.

---

## Roadmap consolidado (síntese do orquestrador)

Reconcilia as três propostas: começa pela **fundação confiável e acessível** (Doctor + confiança + acessibilidade),
sem abrir mão dos **quick wins de fluxo** baratos (progresso, permalink, export) — todos cabem cedo por serem baixo esforço.

### v0.2 — Fundação confiável + acessível
`#1 Doctor` · `#14 Índice de confiança` · `#8 Acessibilidade (duplo canal + AA + print)` · `#6 Progresso/desbloqueáveis` · `#9 Deep-link` · `#4 Export + --summary`
> Ordem interna sugerida: primeiro #1+#14 (verdade do dado) e #8 (nasce acessível), depois #6/#9/#4 (fluxo+compartilhamento). Release "gorda" — pode partir em v0.2a/v0.2b.

### v0.3 — Enforcement no pipeline
`#2 CI Gate (+baseline incremental)` · `Doctor-as-PR-comment` · `#12 Robustez de imports (proveniência por aresta)`
> Gate só sobre um Doctor estável; robustez de imports corrige a maior fonte de arestas erradas e alimenta o índice de confiança.

### v0.4 — Leitura & navegação
`#10 Legibilidade + minimapa + busca/auto-zoom` · `#7 Métricas de grafo`
> Auto-zoom é pré-requisito de v0.5; métricas preparam Foco e Standup.

### v0.5 — Diagnóstico & foco
`#17 Diagnóstico sobreposto` · `#15 Foco numa task` · `#16 Standup view`
> Camadas de render/derivação sobre a base pronta — sem novo risco de corretude.

### v0.6+ — Tempo & escala (apostas de maior risco)
`#3 Diff/Timeline` · `#5 First Run/Tour` · **adiados:** `#11 Sugiyama` (só com ordenação canônica determinística) · `#13 Multi-linguagem` (sob demanda real, uma linguagem por vez)

---

## Princípios-guarda (invioláveis) — consolidados

1. **Um comando, zero fricção, zero deps.** `npx`/binário sem instalar nada; nenhuma dependência de runtime; HTML self-contained que abre por `file://` atrás de firewall. Se exige servidor ou dep, não entra.
2. **Read-only e determinístico, sempre.** Nunca escreve nos artefatos; mesmo input → mesma saída byte-a-byte (HTML e JSON), sem timestamp/rede/ordem-de-FS. Git é opcional e degrada com aviso.
3. **Incerteza explícita, nunca silenciosa.** O que é heurístico se declara (índice de confiança, proveniência por aresta, "arquitetura: heurística"); regex jamais descarta caso sem registrar.
4. **Nunca só cor; AA sempre; movimento é opcional.** Toda codificação tem segundo canal (forma/ícone/traço); contraste ≥4.5:1 texto e ≥3:1 elementos; `prefers-reduced-motion`/print congelam animação preservando o estado legível.
5. **Camada de render nunca reanalisa.** Badges, foco e diff consomem só a saída determinística do parser/Doctor.

---

## "Se fizer só uma coisa a seguir"

| Persona | Voto | Motivo |
|---|---|---|
| Ana | **#6 Progresso/desbloqueáveis** | menor esforço, maior retorno de fluxo diário; cria o hábito de uso |
| Bruno | **#1 Doctor** | fundação de metade do backlog; determinístico e barato; vira "verificador confiável" |
| Célia | **#8 Acessibilidade** | melhora as 3 abas de uma vez; pré-requisito silencioso do diagnóstico por forma |

**Recomendação do orquestrador:** **#1 Doctor** primeiro (maior alavancagem — destrava CI Gate, Standup, PR-comment
e Diagnóstico), imediatamente seguido de **#6** (hábito diário) e nascido com **#8** (acessível por padrão). Os três
formam o coração da v0.2.

---

## Próximos passos sugeridos

1. Implementar o **Doctor (`src/doctor.mjs`)** com as 10 regras + Tarjan iterativo; expor `--doctor` e injetar `findings[]` no HTML.
2. Instrumentar o parser para **proveniência** e derivar o **Índice de confiança**.
3. Aplicar **duplo canal + AA** ao render atual (formas por prioridade, tokens AA, modo claro/print).
4. Adicionar **#6/#9/#4** (fluxo + compartilhamento) — todos de baixo esforço e independentes.
5. Só então avançar para **CI Gate** e as fases seguintes.

_Documento gerado a partir de um brainstorm de 3 agentes × 5 rodadas. Ideias são propostas, não implementações._
