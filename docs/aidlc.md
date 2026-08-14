# AI-DLC (awslabs/aidlc-workflows) — estudo de adapter para o SDD-Graph

> Investigação de viabilidade, não implementação. Resumo desta análise também está
> referenciado em [`docs/plano-sdd-graph.md`](plano-sdd-graph.md) (seção B.6.1).

## O que é o AI-DLC

Não é um formato de artefato fixo como o SpecKit — é um conjunto de **steering rules**
(`aidlc-rules/`) que guiam um agente de IA por 3 fases: **Inception** (requisitos, user
stories, "unidades de trabalho") → **Construction** (implementação paralela por unidade)
→ **Delivery** (build/test/PR). Harness-neutro (Claude Code, Kiro, Cursor, Copilot…),
instalado no projeto-alvo.

## Estrutura de saída confirmada

```
aidlc-docs/
├── inception/{plans, reverse-engineering, requirements, user-stories, application-design}/
├── construction/{plans, {unit-name}/{functional-design,nfr-*,infra-design,code}, build-and-test}/
├── operations/
├── aidlc-state.md
└── audit.md
```

## Achado decisivo: sem template fixo em nenhum dos 3 artefatos-chave

| Artefato | Nosso equivalente | Confirmado na fonte |
|---|---|---|
| `inception/requirements/requirements.md` | `requirements` (FR/RF) | Seções por **nome livre** (Functional/Non-Functional/…), **sem convenção de ID** — prosa organizada por heading, não tabela |
| `inception/user-stories/{stories.md,personas.md}` | `stories` | Só um exemplo solto de ID (`US-1`); critério INVEST mencionado; sem template de prioridade confirmado |
| `construction/{unit-of-work.md, unit-of-work-dependency.md, unit-of-work-story-map.md}` | `Task[]` — o grafo de Dependências, nosso maior diferencial | A regra-fonte (`units-generation.md`) **admite textualmente**: *"the document does not provide explicit markdown templates, schemas, ID formats, or example tables"* |
| `aidlc-state.md` | possível estado estruturado (como `progress.jsonl` do Reversa) | Também sem schema — só "seções `##` soltas" |
| `extensions/` (regras) | possível ponto de integração oficial | Só `resiliency/`, `security/`, `testing/` — extensões **próprias da AWS**, não um gancho público para ferramentas terceiras |

Diferente do Reversa (template rígido confirmado em `templates/forward/body/
actions-template.md`) e do SpecKit (convenção `- [ ] T001 (depende de T002)` usada de
forma consistente), o AI-DLC **deixa a estrutura exata a critério do LLM que gera o
documento em cada projeto** — pode variar projeto a projeto, execução a execução.

## Comparativo de risco entre os 4 candidatos

| Fonte | Template fixo? | Risco de parser |
|---|---|---|
| SpecKit | ✅ sim, estável | Baixo — implementado |
| Reversa (forward) | ✅ sim, confirmado no repo | Baixo — implementado |
| BMad | ⚠️ tinha, reescrito 5 dias antes da pesquisa | Médio — adiado até estabilizar |
| AI-DLC | ❌ nunca teve (por design) | Alto — sem solução direta |

---

## Que solução atenderia o AI-DLC?

Um parser por regex/tabela precisa de estrutura estável, que o AI-DLC não garante. Três
caminhos possíveis, em ordem de recomendação:

### Opção 1 — Regra-ponte ("bridge rule") — **recomendada**

O AI-DLC já roda um agente de IA no projeto do usuário (é o próprio agente que gera os
docs). Em vez de tentar **ler** prosa livre depois, a ideia é **pedir ao agente, no
momento em que ele já está gerando os artefatos**, para **também** escrever um arquivo
extra pequeno e **de formato fixo — definido por nós**:

```
aidlc-docs/sdd-graph.json
{
  "units": [ { "id": "U1", "title": "...", "depends_on": ["U0"], "status": "todo|doing|done" } ],
  "requirements": [ { "id": "REQ-1", "text": "...", "priority": "P1|P2|P3|null" } ],
  "stories": [ { "id": "US-1", "actor": "...", "title": "...", "priority": "P1|P2|P3|null" } ]
}
```

Como isso funciona na prática: distribuímos um pequeno arquivo de regra (15–20 linhas de
markdown, no espírito do nosso próprio `/sdd-graph`) que o usuário adiciona ao projeto
(junto das regras do AI-DLC, ou como instrução customizada do agente). A regra diz:
*"ao final da fase de Inception/Units Generation, grave também `aidlc-docs/
sdd-graph.json` neste formato exato: …"*. Nosso adapter então **só lê esse JSON fixo** —
mesmo padrão determinístico do SpecKit/Reversa, **sem** LLM em tempo de geração do nosso
lado (a "inteligência" já rolou na sessão do agente, que o usuário ia rodar de qualquer
forma).

**Vantagens:** mantém 100% dos princípios do projeto (zero-deps, offline, determinístico);
nos dá o grafo de dependências de verdade (o diferencial da ferramenta).
**Custo:** exige opt-in — só funciona daqui pra frente, em projetos que instalarem a
regra-ponte; não lê retroativamente um `aidlc-docs/` que já existe sem ela.
**Por que é o melhor encaixe:** é literalmente o que já fazemos hoje (o `/sdd-graph` é uma
regra que instalamos no agente do usuário) — só que aplicada a *escrever* em vez de gerar
o grafo.

### Opção 2 — Adapter heurístico best-effort — fallback sem opt-in

Parser puramente textual (zero LLM, mantém offline/determinístico), sem exigir mudança no
projeto do usuário:

- **Stories**: divide `stories.md` por headings `##`/`###`; heading = título; primeiro
  parágrafo = descrição; padrão "Como `<persona>`…"/"As a…" = ator; usa `US-N` se
  presente, senão sintetiza `US1, US2…`.
- **Requisitos**: mesma extração por heading em `requirements.md` (Functional/
  Non-Functional); sem ID nativo → sintetiza `REQ-1, REQ-2…`.
- **Dependências (unidades)**: só se houver uma tabela Markdown reconhecível em
  `unit-of-work-dependency.md` (não garantido); sem tabela → unidades aparecem sem
  aresta (nó solto, não fabrica ligação).

**Vantagens:** funciona imediatamente em qualquer projeto AI-DLC existente, sem pedir
nada a ninguém.
**Custo:** o "grafo de Dependências" pode sair vazio/pobre em muitos projetos reais (a
tabela de dependências não tem formato garantido). **Honesto por construção**: o índice
de confiança (reusado sem mudança) refletiria isso automaticamente — badge baixo quando a
extração for pobre, em vez de fingir precisão que não existe.

### Opção 3 — Extração assistida por LLM — fora de escopo por ora

Usar uma chamada de LLM (API do usuário) pra ler a prosa livre e extrair pro modelo
canônico, com **cache determinístico** (mesmo hash de conteúdo → mesma extração,
reexecuta só se a fonte mudar). É o mais preciso em tese, mas:

- quebra "zero dependências de runtime"/"sem rede" como caminho **obrigatório** — teria
  que ser estritamente opt-in (`--adapter aidlc --extract-with-llm`);
- não-determinístico na primeira extração (cacheável depois);
- custa tokens ao usuário;
- é uma categoria de adapter nova (todos os outros são parsers puros) — precedente que
  merece decisão própria, não algo pra introduzir de passagem.

**Veredito:** mantém como ideia registrada, não perseguida agora.

## Recomendação

**Opção 1 (regra-ponte) como caminho principal**, porque é a única que entrega o grafo de
dependências de verdade sem abrir mão de nenhum princípio do projeto — e reaproveita um
padrão que já dominamos (distribuir uma regra pequena pro agente do usuário). **Opção 2
como complemento automático**, pros projetos que não adotarem a ponte (autodetectado,
valor imediato, porém com confiança honestamente mais baixa). **Opção 3 fica de fora**,
registrada para o caso de um dia fazer sentido um modo experimental.

## Próximos passos concretos, se decidirmos seguir

1. Escrever o rule-snippet da Opção 1 (~15–20 linhas) definindo o JSON de ponte.
2. Testar instalando esse snippet num projeto AI-DLC real (precisa de alguém rodando o
   workflow de verdade) e confirmar que o agente obedece e grava o arquivo como esperado.
3. Se funcionar: implementar `src/adapters/aidlc.mjs` lendo `aidlc-docs/sdd-graph.json`
   (fixo, nosso) — adapter trivial, no mesmo padrão dos outros.
4. Em paralelo/opcional: implementar a Opção 2 como fallback automático quando o arquivo
   de ponte não existir.
5. Decisão em aberto (adicionar à Parte D do plano-mestre): vale investir nisso agora, ou
   só quando houver demanda real por visualizar um projeto AI-DLC?

## Fontes consultadas

- Visão geral: `README.md`, `AGENTS.md` — repositório `awslabs/aidlc-workflows`.
- Estrutura de saída e fases: `aidlc-rules/aws-aidlc-rules/core-workflow.md`.
- Ausência de template fixo (achado decisivo): `aidlc-rules/aws-aidlc-rule-details/
  inception/{requirements-analysis,user-stories,units-generation}.md`.
- Extensões existentes (não são gancho público): listagem de
  `aidlc-rules/aws-aidlc-rule-details/extensions/` (resiliency, security, testing).
- Todos os fetches feitos diretamente no repositório (branch `main`), não em resumos de
  busca — mesma disciplina aplicada ao Reversa e ao achado do BMad v6.11.
