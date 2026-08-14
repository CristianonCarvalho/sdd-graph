# SDD-Graph — instruções do projeto

Este repositório é o **SDD-Graph** (em transição a partir de `speckit-graph`): CLI Node
**zero dependências de runtime** que lê artefatos de *Spec-Driven Development* (hoje
SpecKit; no roadmap BMad e Reversa) e gera **um HTML self-contained** com diagramas D3.
Plano-mestre: **`docs/plano-sdd-graph.md`**.

## Invariantes (não quebre)
- **Determinismo**: mesma entrada → mesmos bytes. Sem `Date.now`/`new Date`/`Math.random`/
  rede no parsing ou na saída; JSON canônico (chaves ordenadas); ordenação com desempate
  estável por id/chave.
- **Zero dependências de runtime** (Node ≥ 18); D3 embutido; HTML utilizável offline
  (`file://`).
- **Nunca escreve nos artefatos de origem** (specs/stories/reversa) — só lê.
- Todo núcleo puro novo tem teste `node:test`; a suíte (`node --test test/*.test.mjs`)
  precisa passar.
- Rename: preservar o prefixo CSS `--sg-`; distinguir **"speckit-graph" (nosso app →
  renomear)** de **"SpecKit" (ferramenta de terceiros → manter)**.

## Fluxo de revisão OBRIGATÓRIO (sem hooks)
A revisão de aderência ao plano é acionada por **você (agente principal)** — não há hooks.
Ao concluir **CADA etapa** de desenvolvimento (tipicamente a cada commit, ou antes de
fechar uma tarefa do plano), você **DEVE acionar o subagente `revisor-sdd-graph`** para
auditar a etapa contra `docs/plano-sdd-graph.md` (aderência, consistência, qualidade,
determinismo, coexistência).

Só prossiga para a próxima etapa depois de:
1. ler o relatório do revisor;
2. **corrigir todo achado BLOQUEADOR e ALTO** (ou registrar explicitamente por que não);
3. decidir sobre os MÉDIO/BAIXO e as melhorias sugeridas.

**Não avance com bloqueadores em aberto.** Se a etapa foi trivial (ex.: doc/typo), ainda
assim declare que dispensou a revisão e por quê.
