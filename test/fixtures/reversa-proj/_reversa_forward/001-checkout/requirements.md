# Requirements: Checkout

> Identificador: `001-checkout`
> Data: `2026-08-10`
> Pasta da extração reversa: `_reversa_sdd/`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

Permite ao cliente finalizar a compra pagando via gateway externo.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/architecture.md#pagamentos` | fluxo de pagamento legado | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| Comprador | Finalizar a compra com segurança | Informa cartão e confirma o pedido |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Pedido só é criado após confirmação do pagamento 🟢

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | Criar pedido a partir do carrinho | Must | Pedido persistido com status pendente | 🟢 |
| RF-02 | Processar pagamento via gateway externo | Must | Pagamento aprovado atualiza status do pedido | 🟢 |
| RF-03 | Enviar confirmação por e-mail | Should | E-mail chega em até 1 min | 🟡 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Segurança | Dados de cartão nunca tocam nosso banco | PCI compliance do legado | 🟢 |

## 7. Critérios de Aceitação

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|----------------|
| RF-01 | Must | fluxo crítico |

## 9. Esclarecimentos

> Nenhuma sessão de dúvidas registrada ainda.

## 10. Lacunas

- 🔴 [DÚVIDA] Confirmar limite de tentativas de pagamento

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-08-10 | Versão inicial gerada por `/reversa-requirements` | reversa |
