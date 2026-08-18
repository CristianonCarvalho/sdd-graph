# Checkout Flow Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its
Execute flow and Critical Rules.

---

**Design**: `.specs/features/checkout-flow/design.md`
**Status**: In Progress

---

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation                    | Location Pattern            | Run Command    |
| ---------- | ------------------- | ---------------------------------------- | ---------------------------- | --------------- |
| Service    | unit                 | All branches; 1:1 to spec ACs            | `src/**/__test__/*.spec.ts` | `yarn test:unit` |
| Component  | e2e                  | All routes: happy + edge + error         | `src/**/__test__/*.e2e-spec.ts` | `yarn test:e2e` |

## Gate Check Commands

| Gate Level | When to Use                              | Command             |
| ---------- | ------------------------------------------ | --------------------- |
| Quick      | After tasks with unit tests only           | `yarn test:unit`      |
| Full       | After tasks with e2e/integration tests     | `yarn test:unit && yarn test:e2e` |
| Build      | After phase completion or config-only tasks | `yarn build && yarn lint && yarn test` |

---

## Execution Plan

### Phase 1: Foundation

```
T1 → T2 → T3
```

### Phase 2: Core Implementation

```
T4 → T5 → T6
```

---

## Task Breakdown

### T1: Create CheckoutSession entity

**What**: Define the CheckoutSession domain entity with a guest flag
**Where**: `src/config/checkout.ts`
**Depends on**: None
**Reuses**: `src/shared/domain/Entity.ts`
**Requirement**: CHK-01

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] Entity defined with guest flag
- [x] Unit tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(checkout): add CheckoutSession entity`

---

### T2: Implement GuestCheckoutService

**What**: Orchestrate guest checkout without requiring an account
**Where**: `src/services/GuestCheckoutService.ts`
**Depends on**: T1
**Reuses**: `src/checkout/domain/CheckoutSession.ts`
**Requirement**: CHK-01

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] Implements guest checkout flow end to end
- [ ] Gate check passes: `yarn test:unit`

**Tests**: unit
**Gate**: quick

---

### T3: Add checkout field validation

**What**: Reject checkout submissions with missing required fields
**Where**: `src/services/CheckoutValidation.ts`
**Depends on**: T1
**Reuses**: `src/shared/validation/Validator.ts`
**Requirement**: CHK-02

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [ ] Validation rules implemented per spec edge cases
- [ ] Field-level errors returned

**Tests**: unit
**Gate**: quick

---

### T4: Create PaymentMethodRepository

**What**: CRUD access for saved payment methods
**Where**: `src/integrations/payment-gateway/PaymentMethodRepository.ts`
**Depends on**: T2
**Reuses**: `src/shared/repositories/BaseRepository.ts`
**Requirement**: CHK-03

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] CRUD methods implemented
- [x] Integration tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(checkout): add PaymentMethodRepository`

---

### T5: Wire SavedPaymentMethods UI

**What**: Preselect a saved payment method at checkout
**Where**: `src/api/checkout/SavedPaymentMethods.ts`
**Depends on**: T4
**Reuses**: `src/checkout/components/PaymentMethodCard.tsx`
**Requirement**: CHK-03

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [ ] Component renders saved methods
- [ ] E2E test passes

**Tests**: e2e
**Gate**: full

---

### T6: Add checkout confirmation step

**What**: Render a confirmation screen after order creation
**Where**: `src/models/Order.ts`
**Depends on**: T2, T4
**Reuses**: `src/checkout/components/OrderSummary.tsx`

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [ ] Confirmation screen renders order summary

**Tests**: none
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5 ------→ T6
```

---

## Task Granularity Check

| Task                              | Scope       | Status      |
| ---------------------------------- | ----------- | ----------- |
| T1: Create CheckoutSession entity  | 1 entity    | ✅ Granular |
| T2: Implement GuestCheckoutService | 1 service   | ✅ Granular |
| T3: Add checkout field validation  | 1 function  | ✅ Granular |
| T4: Create PaymentMethodRepository | 1 repository | ✅ Granular |
| T5: Wire SavedPaymentMethods UI    | 1 component | ✅ Granular |
| T6: Add checkout confirmation step | 1 component | ✅ Granular |
