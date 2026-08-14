# Actions: Checkout

> Identificador: `001-checkout`
> Data: `2026-08-10`
> Roadmap: `_reversa_forward/001-checkout/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 6 |
| Paralelizáveis (`[//]`) | 2 |
| Maior cadeia de dependência | 3 |

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Configurar variáveis de ambiente do gateway | - | `[//]` | `src/config/env.py` | 🟢 | `[X]` |
| T002 | Criar migração da tabela pedidos | - | `[//]` | `src/models/migrations/0001_pedidos.py` | 🟢 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T003 | Implementar serviço de pedido RF-01 | T002 | - | `src/services/pedido.py` | 🟢 | `[X]` |
| T004 | Integrar gateway de pagamento RF-02 | T001, T003 | - | `src/integrations/pagamento.py` | 🟡 | `[ ]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T005 | Expor endpoint de checkout | T004 | - | `src/api/checkout.py` | 🟢 | `[ ]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T006 | Enviar e-mail de confirmação | T005 | `[//]` | `src/services/notificacao.py` | 🟢 | `[ ]` |

## Notas de execução

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-08-10 | Versão inicial gerada por `/reversa-to-do` | reversa |
