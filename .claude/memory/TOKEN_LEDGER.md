# Token Ledger
# Per agent per cycle: tokens, cost, model
# Phase totals compared against max_tokens_per_phase
# Run total compared against budget thresholds

---

## Ledger Entry Format

| phase | agent | cycle | tokens_in | tokens_out | model | est_cost_usd |
|-------|-------|-------|-----------|------------|-------|--------------|

---

## Entries

(Orchestrator will append entries here after every agent spawn)

| phase-8-5-ref-data-products | orchestrator | 1 | 0 | 0 | claude-sonnet-4-6-20250514 | 0.000 |
| phase-8-5-ref-data-products | orchestrator | 1 | 800 | 200 | claude-sonnet-4-6-20250514 | 0.003 |
| phase-8-5-ref-data-products | validator | 1 | 14000 | 5000 | claude-sonnet-4-6-20250514 | 0.117 |
| phase-8-5-ref-data-products | builder | 1 | 38000 | 6000 | claude-sonnet-4-6-20250514 | 0.204 |

---

## Budget Tracking

**Per-Phase Budget:**
- max_tokens_per_phase: 20,000 (from config.yaml)
- When phase total exceeds threshold: pause and ask user

**Run-Level Budget:**
- budget_warning: 80,000 (switch structured output to Haiku, warn user)
- budget_hard_limit: 120,000 (pause, ask: continue or stop)

---

## Cost Calculation

Estimated costs based on model:
- claude-sonnet-4-6-20250514: $3.00 per 1M input tokens, $15.00 per 1M output tokens
- claude-haiku-4-5-20251001: $0.25 per 1M input tokens, $1.25 per 1M output tokens

---

## Summary Statistics

(Orchestrator will update this section periodically)

Total tokens spent: 0
Total estimated cost: $0.00
Average tokens per phase: 0
Highest spending phase: (none yet)
Highest spending agent: (none yet)
