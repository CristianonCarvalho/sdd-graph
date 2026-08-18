# Checkout Flow Specification

## Problem Statement

Shoppers abandon carts when checkout forces account creation. We need a fast path that
still supports saved payment methods for returning customers.

## Goals

- [ ] Guest checkout completes in under 2 minutes
- [ ] Returning customers can reuse a saved payment method

## Out of Scope

| Feature              | Reason                          |
| --------------------- | -------------------------------- |
| Multi-currency pricing | Handled by a separate initiative |

---

## Assumptions & Open Questions

| Assumption / decision        | Chosen default              | Rationale                     | Confirmed? |
| ----------------------------- | ---------------------------- | ------------------------------ | ---------- |
| Guest sessions expire in 24h  | 24h TTL                      | Matches cart expiry policy     | y          |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Guest Checkout ⭐ MVP

**User Story**: As a shopper, I want to check out without creating an account so that I can complete a purchase quickly.

**Why P1**: Guest checkout is the primary conversion path for new shoppers.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN a shopper submits the checkout form THEN the system SHALL create an order without requiring account creation
2. IF required checkout fields are missing THEN the system SHALL reject the submission with field-level errors
3. The system SHALL expire an unfinished guest session after 24 hours

**Independent Test**: Complete checkout as a guest and confirm an order is created.

---

### P2: Saved Payment Methods

**User Story**: As a returning customer, I want to save a payment method so that I can check out faster next time.

**Why P2**: Reduces friction for repeat purchases but is not required for MVP conversion.

**Acceptance Criteria**:

1. WHEN a signed-in customer completes checkout THEN the system SHALL offer to save the payment method
2. WHILE a saved payment method exists the system SHALL preselect it at checkout

**Independent Test**: Save a payment method, start a new checkout, confirm it is preselected.

---

### P3: Order Confirmation Email

**User Story**: As a shopper, I want to receive an order confirmation email so that I have proof of purchase.

**Why P3**: Nice-to-have communication that doesn't block the purchase itself.

**Acceptance Criteria**:

1. WHEN an order is created THEN the system SHALL send a confirmation email within 5 minutes

---

## Edge Cases

- IF payment authorization fails THEN the system SHALL show a retry option without losing cart contents
- WHEN the cart is empty THEN the system SHALL block checkout submission

---

## Requirement Traceability

| Requirement ID | Story                          | Phase  | Status  |
| --------------- | ------------------------------- | ------ | ------- |
| CHK-01          | P1: Guest Checkout               | Design | Pending |
| CHK-02          | P1: Guest Checkout               | Design | Pending |
| CHK-03          | P2: Saved Payment Methods        | Design | Pending |
| CHK-04          | P3: Order Confirmation Email     | Design | Pending |

**ID format:** `[CATEGORY]-[NUMBER]` (e.g., `CHK-01`)

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 4 total, 3 mapped to tasks, 1 unmapped ⚠️

---

## Success Criteria

- [ ] Guest can complete checkout end to end
- [ ] Returning customer's saved method is preselected
