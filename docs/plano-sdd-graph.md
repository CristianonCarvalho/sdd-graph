# Plano — Renomear para **SDD-Graph** e suportar múltiplas ferramentas SDD

> Documento de **planejamento** (sem implementação). Define a renomeação de
> `speckit-graph` → `SDD-Graph` e a arquitetura para suportar outras ferramentas de
> *Spec-Driven Development* (SDD) — começando por **BMAD-METHOD (BMad)** e **Reversa
> (sandeco/reversa)** — além do SpecKit atual.

---

## 0. Objetivo e princípio

Hoje o app é acoplado ao **SpecKit** (`specs/*/tasks.md`, `spec.md`, `plan.md`). A boa
notícia: ele **já é construído sobre um modelo normalizado** (a saída de `parseSpecs()`
— tasks, usecases, requisitos, arquitetura, diagnostics, confidence). Todo o resto
(template HTML, Doctor, gate, diff, timeline, summary) consome esse modelo, **não** o
formato do SpecKit diretamente.

Logo, a estratégia é:

1. **Renomear** para um nome neutro de ferramenta (**SDD-Graph**), porque o app deixa de
   ser "só SpecKit".
2. **Extrair** o parsing específico do SpecKit para um **adapter**, formalizar o
   **modelo canônico** e adicionar adapters para BMad e Reversa que produzem o mesmo
   modelo. **~80% do código não muda** (só passa a receber o modelo de outra fonte).

---

# PARTE A — Renomeação `speckit-graph` → `SDD-Graph`

## A.1 Identidade

| Item | Hoje | Proposto |
|---|---|---|
| Nome exibido | speckit-graph / "Mapa do SpecKit" | **SDD-Graph** / "Mapa SDD" |
| Pacote (`package.json name`) | `speckit-graph` | `sdd-graph` |
| Binário (`bin`) | `speckit-graph` | `sdd-graph` (+ alias `speckit-graph` por 1–2 versões) |
| Comando de IA | `/speckit-graph` | `/sdd-graph` (+ alias `/speckit-graph` por 1–2 versões) |
| Repo GitHub | `CristianonCarvalho/speckit-graph` | `CristianonCarvalho/sdd-graph` (GitHub mantém redirect do nome antigo) |
| Prefixo CSS | `--sg-*` (143 ocorrências) | **mantém `--sg-`** — relê "sg" como *SDD-Graph* (zero churn) |
| Marcador de PR | `<!-- speckit-graph -->` | `<!-- sdd-graph -->` (ver risco A.6) |

**Racional do "SDD-Graph":** genérico à metodologia (Spec-Driven Development), não à
ferramenta; mantém o sufixo "-Graph" já conhecido; preserva o prefixo CSS `--sg-`.

## A.2 Inventário de ocorrências (levantado por grep)

- **22 arquivos** citam "speckit".
- **169** ocorrências de `speckit-graph`; **213** de "speckit" (inclui referências ao
  produto SpecKit, que **devem permanecer** onde descrevem o adapter SpecKit).
- **143** usos de `--sg-` (CSS) → **não mudam**.
- **3** usos do marcador `<!-- speckit-graph -->` (gate + teste + exemplo).

Arquivos afetados (núcleo): `package.json`, `bin/cli.mjs`, `src/*.mjs`,
`src/template.html`, `src/template.mjs`, `commands/**`, `examples/github/*.yml`,
`README.md`, `CHANGELOG.md`, `test/gate.test.mjs`, `.gitignore` (linha do `.html`),
`brain01.md` (histórico — pode manter).

> **Distinção crítica:** separar **"speckit-graph" (nosso app → renomear)** de
> **"SpecKit" (a ferramenta de terceiros → manter)**. Muitas das 213 ocorrências são
> descrições legítimas do SpecKit e continuam válidas dentro do *adapter SpecKit*.

## A.3 O que muda vs. o que fica

**Muda:** nome do pacote/bin, nome dos arquivos de comando (`commands/**/speckit-graph.*`
→ `sdd-graph.*`), título do HTML, textos de `--help`, URLs no README/CHANGELOG, string
`tool: 'speckit-graph'` nos relatórios JSON/snapshot, nome do arquivo de saída padrão
(`speckit-graph.html` → `sdd-graph.html`).

**Fica (de propósito):** prefixo CSS `--sg-`; algoritmos; **fingerprints** (FNV-1a de
`slug|id|kind|target` — independem do nome ⇒ **baselines de CI sobrevivem**); estrutura
de `diff`/`snapshot` (o `diff` compara `specs`, ignora o campo `tool` ⇒ snapshots antigos
continuam comparáveis).

## A.4 Compatibilidade retroativa (não quebrar quem já usa)

1. **Instalação por `npx github:`** — o redirect do GitHub mantém
   `github:CristianonCarvalho/speckit-graph` funcionando após o rename do repo. Ainda
   assim, atualizar a doc para o novo slug.
2. **Binário** — manter `bin: { "sdd-graph": ..., "speckit-graph": ... }` por 1–2
   versões, com aviso de *deprecation* quando invocado pelo nome antigo.
3. **Comando `/speckit-graph`** — `init` passa a instalar `/sdd-graph`; oferecer
   `init --keep-legacy` para também instalar o alias antigo, e `init --migrate` para
   remover os arquivos `speckit-graph.*` instalados.
4. **Saída padrão** — se existir `speckit-graph.html` no diretório e nenhum `--out`, emitir
   aviso sugerindo o novo nome (evita "arquivo órfão" no `.gitignore` do usuário).

## A.5 Passos de execução (ordem sugerida)

1. Renomear arquivos em `commands/**` e ajustar `TARGETS` no `cli.mjs`.
2. Trocar strings de nome (help, `tool:`, título HTML, README/CHANGELOG, exemplo de
   workflow) — **sem** tocar em `--sg-` nem em descrições legítimas do SpecKit.
3. `package.json`: `name`, `bin` (com alias), `repository.url`.
4. Atualizar `test/gate.test.mjs` (nome/mark).
5. Renomear o repo no GitHub; recriar a *release* com o novo nome; manter tags.
6. Bump de versão (ver Parte C) + CHANGELOG "Renomeado para SDD-Graph".

## A.6 Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Marcador de PR muda (`<!-- speckit-graph -->` → `<!-- sdd-graph -->`) | 1º run pós-upgrade posta **comentário novo** em vez de editar o antigo | Fazer o `check --format md` reconhecer **ambos** os marcadores ao localizar o comentário; ou manter o marcador antigo por 1 versão |
| Comando antigo instalado nos projetos dos usuários | `/speckit-graph` continua apontando para a versão instalada | `init --migrate` + nota no CHANGELOG |
| Cache do `npx` | usuários pegam versão antiga | documentar `rm -rf ~/.npm/_npx` |
| String `tool:` em baselines/snapshots versionados | mudança de bytes | baseline usa só `fingerprints` (tool ignorado) e diff ignora `tool` ⇒ **sem quebra**; documentar mesmo assim |

---

# PARTE B — Suporte multi-ferramenta SDD (arquitetura de adapters)

## B.1 Princípio

Introduzir uma camada de **adapters**: cada ferramenta SDD tem um adapter que **lê seus
artefatos** e devolve o **modelo canônico**. O núcleo (HTML, Doctor, gate, diff, timeline,
summary) permanece agnóstico.

```
projeto → [detecção] → adapter (speckit | bmad | reversa | …) → MODELO CANÔNICO → núcleo
```

## B.2 Modelo canônico (o contrato)

Formaliza o que hoje já é a saída de `parseSpecs()`. Uma **Unidade** = uma feature /
epic / módulo (o que hoje é um `spec`):

```
Unit {
  id: string                 // slug estável da unidade
  title: string
  source: 'speckit'|'bmad'|'reversa'
  tasks: Task[]              // itens de trabalho atômicos
  stories: Story[]           // histórias/casos de uso (ator → objetivo)
  requirements: { [id]: string }   // FR/NFR/AC — texto por id
  architecture: Arch         // { nodes, links, meta, source, provenance }
  native: {                  // achados/índices já prontos vindos da ferramenta
    diagnostics?: Finding[], confidenceReport?: {...}
  }
}
Task {
  id, label, phase, priority: 'P1'|'P2'|'P3'|'FOUND'|'SETUP'|'POLISH'|null,
  story: id|null, status: 'todo'|'doing'|'done', parallel: bool,
  deps: id[], requirements: id[]      // ids de FR/AC cobertos
}
Story { id, title, priority, actor, desc, requirements: id[] }
```

Observação: o `rec` atual (`tasks`, `usecases`, `actors`, `frText`, `arch`,
`diagnostics`, `confidence`) já é **quase** isso. Mudanças mínimas: `frText → requirements`,
`usecases → stories`, `done/inProgress → status`, e um campo `native` para dados que a
ferramenta já entrega prontos (ex.: confidence do Reversa).

## B.3 Interface do adapter, registry e detecção

```
// src/adapters/<tool>.mjs  (design, não implementação)
export default {
  name: 'speckit', label: 'SpecKit',
  detect(root): number,        // 0..1 — confiança de que o projeto usa esta ferramenta
  discover(root, opts): {units: string[]},   // localiza as unidades
  load(unitPath, opts): Unit,  // lê e normaliza uma unidade → modelo canônico
  capabilities: {
    deps: true,                       // tem grafo de dependências de tasks?
    stories: true,                    // tem histórias/casos de uso?
    requirements: 'FR'|'AC'|'none',   // vocabulário de requisitos
    architecture: 'from-code'|'from-specs'|'native',  // origem da arquitetura
  }
}
```

- **Registry** (`src/adapters/index.mjs`): lista os adapters; `resolveAdapters(root, flags)`
  retorna **todos** os adapters com `detect() ≥ limiar` (não apenas o vencedor — ver **B.9**),
  a menos que `--adapter <nome[,nome]>` restrinja.
- **Detecção por presença de arquivos** (ver por-ferramenta abaixo).
- **Config opcional** `sdd-graph.config.json`: pode ser **um** adapter **ou uma lista de
  fontes** com caminhos próprios (monorepo / projeto híbrido):
  ```json
  { "sources": [
      { "adapter": "speckit", "path": "packages/app/specs" },
      { "adapter": "bmad",    "path": "docs" },
      { "adapter": "reversa", "path": "_reversa_sdd" } ] }
  ```

## B.4 Adapter **SpecKit** (refactor do atual — sem mudança de comportamento)

- **Detecção:** existe `specs/*/tasks.md` (e/ou `.specify/`).
- **Origem:** move `parseTasksFile`, `parseSpecMd`, `buildArch` (hoje em `src/parse.mjs`)
  para `src/adapters/speckit.mjs`, produzindo `Unit`.
- **Capabilities:** `{ deps, stories, requirements:'FR', architecture:'from-code' }`.
- **Risco:** baixíssimo — é reempacotamento; a suíte de testes atual passa a validar o
  adapter SpecKit.

## B.5 Adapter **BMad** (BMAD-METHOD)

**Artefatos** (padrão v4/v5): `docs/prd.md`, `docs/architecture.md`, `docs/epics/*.md`,
`docs/stories/*.md`; config em `.bmad-core/` (ou `bmad/`).

**Detecção:** existe `.bmad-core/` **ou** `docs/stories/` + `docs/prd.md`.

**Mapeamento para o modelo canônico:**

| Conceito BMad | → Canônico |
|---|---|
| **Epic** (`docs/epics/<n>.md`) | **Unit** (uma unidade por epic) |
| **Story** (`docs/stories/<epic>.<story>.md`) | agrupa como `Story` **e** seus checkboxes de *Tasks/Subtasks* viram `Task[]` da unidade |
| Seção **Status** (Draft/Approved/InProgress/Review/Done) | `status` no nível da história; tasks internas seguem os checkboxes (`[x]`) |
| **Acceptance Criteria** + notação `(AC: #N)` nas tasks | `requirements` (vocabulário `AC`) + `task.requirements` |
| **Dependency maps** / ordenação epic.story | `task.deps` / ordem de fase |
| **PRD**: Functional/Non-Functional Requirements | `requirements` (FR/NFR) no nível da unidade |
| **Architecture.md** (prosa + mermaid) | `architecture` via parse de blocos ```mermaid (se houver); senão heurístico/from-code |

**Pontos de decisão:**
- **Prioridade:** BMad não usa P1/P2/P3. Derivar de: ordem do epic/story (mais cedo =
  mais crítico) **ou** de um campo `Priority`/MoSCoW se presente. Fallback: `null` (o app
  já lida com prioridade ausente).
- **Granularidade de status:** BMad tem status por **história**; as *subtasks* têm
  checkbox. Decidir se o "nó" do grafo é a **história** (recomendado) com progresso vindo
  dos checkboxes, ou cada subtask (mais ruidoso).
- **Dependências:** menos estruturadas que no SpecKit; começar por ordem epic.story +
  "Dependencies" quando a história listar explicitamente.

## B.6 Adapter **Reversa** (sandeco/reversa)

Reversa tem **dois modos** — e ambos são úteis:

### (a) Forward pipeline → alimenta Dependências/Requisitos
Pasta `_reversa_forward/<NNN>-<short-name>/`:

| Arquivo Reversa | → Canônico |
|---|---|
| `actions.md` (**ações atômicas com IDs estáveis, dependências e marcadores de paralelismo**, em 5 fases) | `Task[]` — casa **quase 1:1** com o `tasks.md` do SpecKit (id, deps, `parallel`, `phase`/`priority`) |
| `requirements.md` | `requirements` + `stories` |
| `roadmap.md` | fases/ordenação |
| `progress.jsonl` | `task.status` (done/doing/todo por ação) |
| `legacy-impact.md`, `regression-watch.md` | metadados (badges/tooltip) |

### (b) Reverse specs → alimenta Arquitetura (e novas telas)
Pasta `_reversa_sdd/`:

| Arquivo Reversa | → Canônico |
|---|---|
| `architecture.md`, `c4-context/containers/components.md`, `dependencies.md` | `architecture` **nativa** (`architecture:'native'`) — parsear C4/deps em vez de reescanear código |
| `erd-complete.md` (Mermaid), `data-dictionary.md` | futura aba **Modelo de dados** |
| `openapi/` | futura aba **Contratos de API** |
| `state-machines.md`, `sequences/`, `flowcharts/` (Mermaid) | futura aba **Fluxos** |
| `confidence-report.md` (🟢🟡🔴) | **importar direto** no índice de confiança (`native.confidenceReport`) |
| `gaps.md`, `questions.md` | **importar direto** como findings do Doctor |
| `traceability/*-matrix.md` | insumo para diff/rastreabilidade |

**Detecção:** existe `_reversa_sdd/` e/ou `_reversa_forward/` (ou `.reversa/`).

**Sinergias fortes:** Reversa **já produz** confiança e lacunas — o adapter *importa* em
vez de recalcular. `architecture:'native'` evita a varredura de imports (útil em legado
grande). O modo forward encaixa no grafo de dependências sem esforço de modelagem.

**Capabilities:** `{ deps: (tem forward?), stories: true, requirements:'FR',
architecture:'native' }`.

## B.7 Impacto por módulo do núcleo

| Módulo | Impacto |
|---|---|
| `template.html` / `template.mjs` | Mínimo. Trocar título; badge da **fonte** (SpecKit/BMad/Reversa). Abas/overlays intactos. |
| `diff.mjs` / `timeline.mjs` | **Zero** — operam sobre o modelo (snapshot de tasks/status/findings). Diff entre commits funciona igual para qualquer adapter. |
| `gate.mjs` | Quase zero (fingerprint independe da fonte). |
| `confidence.mjs` | Estender: se `native.confidenceReport` existir (Reversa), usar/mesclar; senão calcular como hoje. |
| `doctor.mjs` | Generalizar: cada regra declara `appliesTo(capabilities)`. Regras universais (CYCLE, DEP_UNKNOWN, SELF_DEP, DUP_ID, TASK_NO_PRIORITY, TASK_NO_STORY) valem para todos. `FR_ORPHAN`/`STORY_NO_FR` viram regras do vocabulário de requisitos (FR/AC). Adapters podem **injetar findings nativos** (ex.: `gaps.md` do Reversa). |
| `summary.mjs` | Zero (usa o modelo). |
| `cli.mjs` | Novo flag `--adapter <nome>`; `parseSpecs()` vira `parseProject()` (resolve adapter). |

## B.8 Novas telas habilitadas (futuro, fora do rename)

O Reversa (e parcialmente o BMad) fornece dados para **novas abas** além das 3 atuais:
**Modelo de dados (ERD)**, **Contratos de API (OpenAPI)** e **Fluxos (state machines)** —
renderizáveis com o Mermaid nativo/D3. Ficam como extensão pós-adapters.

## B.9 Repositório com **múltiplos métodos** ao mesmo tempo (coexistência)

Cenário real: o mesmo repo tem `specs/` (SpecKit) **e** `docs/stories/` (BMad) **e**
`_reversa_sdd/`/`_reversa_forward/` (Reversa) — por adoção paralela, migração em
andamento, ou subtimes/subpastas com ferramentas diferentes. **A resolução single-adapter
não basta.** Design proposto:

### Modo de agregação (padrão)
Rodar **todos** os adapters detectados; cada um devolve suas `Unit[]`; o núcleo trabalha
com o **conjunto unido**, com `Unit.source` por unidade. Isso reaproveita o **seletor de
unidades** que o HTML já tem (o "toggle de specs") — agora as unidades podem vir de
ferramentas diferentes, cada uma com **badge da fonte**.

- `--adapter all` (default quando há mais de uma detectada) · `--adapter speckit,bmad`
  (subconjunto) · `--adapter reversa` (força uma).

### Pontos que a coexistência exige resolver

| # | Questão | Resolução proposta |
|---|---|---|
| 1 | **Colisão de ids/slugs** entre ferramentas (ex.: SpecKit `001-x` e Reversa `001-x`) | **Namespacing por fonte** no id da unidade: `speckit:001-x`, `bmad:epic-1`, `reversa:001-x`. Mantém permalink (`#spec=…`) e fingerprint únicos. **Impacto:** o slug entra no fingerprint ⇒ baseline muda **uma vez** ao ativar múltiplas fontes (documentar `--update-baseline`). |
| 2 | **Arquitetura em conflito** (SpecKit deriva do código, Reversa dá nativa, BMad tem `architecture.md`) — todas descrevendo o **mesmo** código | Arquitetura é **por unidade** (cada unidade mostra a sua). Para uma visão **de projeto**, política de autoridade: `reversa(native) > from-code(python/java/ts/go) > bmad/heurístico`. Configurável. |
| 3 | **Doctor / gate / confiança** | Rodam **por unidade**, usando as *capabilities* da fonte daquela unidade (regras FR vs AC; confiança nativa do Reversa vs calculada). O relatório do gate passa a carregar `source` por spec. |
| 4 | **Diff / timeline** | Funcionam sem mudança: são por-slug. Com namespacing, unidades de fontes distintas convivem; ao voltar no git, uma fonte pode nem existir (ex.: BMad adicionado depois) → a unidade "aparece/some", que o diff **já trata** (spec added/removed). |
| 5 | **Duplicata semântica** (a mesma feature descrita em 2 métodos) | Aparecem como **2 unidades separadas** (é o que os artefatos são). Um "casar por título/rastreabilidade" fica como **futuro** (não no MVP). |
| 6 | **Reversa forward + reverse juntos** | Resolvido **dentro** do adapter Reversa: `_reversa_forward/*` vira unidades de tasks; `_reversa_sdd/*` vira a arquitetura nativa (e futuras abas ERD/API), anexada às unidades ou como visão de projeto. |
| 7 | **UI** | Badge de fonte por unidade; **agrupar** o seletor por ferramenta e/ou um **filtro por fonte**; o cabeçalho mostra "SDD-Graph · N unidades · SpecKit+BMad+Reversa". |
| 8 | **Escopo em monorepo** | Cada fonte pode ter `path` próprio na config (ver B.3), evitando que um adapter varra a pasta de outro. |

### Veredito da verificação
- **O modelo canônico já está pronto** para coexistência (`Unit.source` por unidade).
- **O fluxo de resolução precisava mudar** de `resolveAdapter` (um) para
  `resolveAdapters` (vários) + **agregação** — corrigido em **B.3**.
- Os **8 pontos acima** são as arestas a fechar; nenhum é bloqueante, mas **#1
  (namespacing)** e **#2 (autoridade de arquitetura)** são decisões que mudam bytes
  (fingerprint) e semântica (qual arquitetura mostrar) e devem ser decididas antes de
  implementar as Fases 2–3.

---

# PARTE C — Roadmap em fases (releases)

| Fase | Entrega | Versão sugerida | Quebra? |
|---|---|---|---|
| **0** | Modelo canônico + registry de adapters; refactor do SpecKit para `adapters/speckit.mjs` (sem mudança visível; testes verdes) | 0.7.x (interno) | Não |
| **1** | **Renomeação → SDD-Graph** (Parte A), com aliases e *deprecation* | **0.8.0** | Não (com aliases) |
| **2** | **Adapter BMad** + detecção + docs | 0.9.0 | Não |
| **3** | **Adapter Reversa** (forward = tasks; reverse = arquitetura nativa; importa confiança/gaps) | 0.10.0 | Não |
| **4** | Generalização do Doctor por *capabilities* + novas abas (ERD/API/fluxos) | 1.0.0 | Não |

Cada fase é independente e testável isoladamente (padrão que já usamos: núcleo puro +
`node:test` + validação headless do HTML).

---

# PARTE D — Decisões em aberto (precisam de você)

1. **Publicar no npm** como `sdd-graph` (hoje só via `github:`)? Se sim, checar
   disponibilidade do nome.
2. **Versão do rename:** 0.8.0 (recomendado) ou já mirar 1.0.0?
3. **Renomear o repo** `speckit-graph → sdd-graph` (redirect cobre os links) ou criar
   repo novo?
4. **Por quanto tempo** manter os aliases `/speckit-graph` e binário antigo?
5. **BMad:** alvo v4 (`.bmad-core/`) ou v5? Suportar *expansion packs*?
6. **Reversa:** priorizar o **forward** (tasks) primeiro, ou já entrar com o **reverse**
   (arquitetura nativa + ERD/API)?
7. **Prioridade** em BMad/Reversa (sem P1/P2/P3): derivar de ordem/fase, campo dedicado,
   ou deixar neutra?
8. **Novas abas** (ERD/API/fluxos) entram no escopo ou ficam para depois?
9. **Coexistência (B.9):** ao detectar mais de um método no repo, **agregar tudo** por
   padrão (recomendado) ou pedir para o usuário escolher/forçar via `--adapter`?
10. **Namespacing de ids** (`fonte:slug`) — aceitar a atualização única do baseline que
    isso implica?
11. **Autoridade de arquitetura** quando várias fontes descrevem o mesmo código:
    `reversa(native) > from-code > heurístico` é a ordem desejada?

---

# PARTE E — Como a revisão é acionada (decisão: **sem hooks**; o orquestrador aciona o subagente)

**Decisão tomada:** **não usar hooks**. A revisão é acionada pelo **agente principal**, que
invoca o subagente `revisor-sdd-graph` ao fim de cada etapa. Para ser confiável (não
depender de "lembrar"), a obrigação está codificada como **regra permanente no `CLAUDE.md`**
do repositório (carregada em toda sessão do Claude Code) e reforçada pela `description`
imperativa do agente. O próprio subagente roda os **checks mecânicos** (testes + greps de
invariantes: determinismo, zero-deps, resíduos de rename, `--sg-` intacto, `resolveAdapter`
sem plural, namespacing `fonte:slug`) **e** a **revisão de julgamento** — sem infra e sem
tokens além da própria sessão.

**Limites honestos:** só cobre trabalho feito **dentro** do Claude Code (edição manual ou de
contribuidor externo não dispara nada); e a regra do `CLAUDE.md` é forte, mas é
**instrução**, não bloqueio técnico. As opções com hooks/CI abaixo ficam como **escalada
opcional (não adotadas por padrão)**, caso um dia se queira garantia *enforced*.

## E.1 Camada 1 — Portão mecânico determinístico (grátis, sempre roda)
**Git `post-commit` hook** (independe do Claude, sem API, sem tokens). A cada commit:
- roda `node --test test/*.test.mjs`;
- checa invariantes por `grep`: determinismo (`Date\.now|new Date|Math\.random` fora de
  contexto legítimo), zero-deps (`dependencies` no `package.json`), resíduos de rename
  (`speckit-graph` onde não deve), `--sg-` intacto, `resolveAdapter` sem plural,
  namespacing `fonte:slug` na coexistência;
- grava `docs/reviews/<hash>.md` com PASS/FAIL + evidências e imprime no terminal.

Não bloqueia (post-commit é pós-fato), mas dá o **sinal imediato** de regressão. É a rede
de segurança confiável — não depende de LLM.

> Versionamento: `.git/hooks/` não é versionado. Usar `git config core.hooksPath .githooks`
> e commitar `.githooks/post-commit`. Um `npm run setup-hooks` configura isso no clone.

## E.2 Camada 2 — Nudge em sessão (Claude Code hook)
`.claude/settings.json`, evento **PostToolUse** com matcher `Bash` e `if: Bash(git commit*)`.
O script emite `additionalContext` do tipo *"Etapa commitada (HEAD=<hash>). Rode o subagente
`revisor-sdd-graph` para auditar contra o plano antes de seguir."* Assim, dentro de uma
sessão, logo após o agente commitar, ele é lembrado de acionar o guardião.

```json
{ "hooks": { "PostToolUse": [ {
  "matcher": "Bash",
  "hooks": [ { "type": "command",
    "if": "Bash(git commit*)",
    "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/nudge-revisor.sh" } ] } ] } }
```
`nudge-revisor.sh` lê o stdin (JSON), confirma que foi um commit, e imprime o
`hookSpecificOutput.additionalContext`. **Ressalva:** é advisory — reforça, não garante;
por isso a Camada 1 é a que realmente segura regressão.

## E.3 Camada 3 — Revisão completa headless (opcional, custa tokens)
No mesmo `post-commit` (atrás de um flag `SDD_REVIEW=1`), chamar o guardião em modo
não-interativo:
```bash
[ "$SDD_REVIEW" = 1 ] && claude -p "use o subagente revisor-sdd-graph para auditar o commit HEAD contra docs/plano-sdd-graph.md" \
  --output-format text > "docs/reviews/$(git rev-parse --short HEAD).review.md"
```
Roda a revisão de **julgamento** (não só mecânica) automaticamente por commit, gravando o
relatório. Custa API e latência (alguns minutos, destacado); por isso é **opt-in** e
recomendável só em marcos (fim de fase), não a cada commit.

## E.4 Recomendação (com a decisão de **não usar hooks**)
- **Adotado:** apenas a regra no `CLAUDE.md` + a `description` do agente (topo da Parte E) —
  o orquestrador aciona o `revisor-sdd-graph` a cada etapa. **Zero infra.** As "Camadas"
  1–3 acima ficam como **referência de escalada, não adotadas**.
- **Escalada futura (opcional):** ao abrir o projeto para mais gente, subir o **portão
  mecânico para CI** (`review.yml`) como *required check* que **bloqueia o merge** — cobre o
  que a instrução não garante.
- **Decisão D-12 (aberta):** manter só a regra do `CLAUDE.md`, ou também um portão em CI nos
  marcos de fase?

---

## Fontes consultadas

- BMAD-METHOD — estrutura de PRD/epics/stories: docs e discussões do repo
  `bmad-code-org/BMAD-METHOD` e material de referência da comunidade.
- Reversa — estrutura de saída (`_reversa_sdd/`, `_reversa_forward/`, `actions.md`,
  `confidence-report.md`, `gaps.md`): repositório `sandeco/reversa`.
