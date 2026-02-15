Here is the full **copy-ready Markdown project specification**.

You can paste this directly into `PROJECT_SPEC.md`.

---

# Veritas

## Autonomous On-Chain Trust Oracle for Solana

---

# 1. Project Overview

Veritas is a fully autonomous AI agent that:

* Observes real-time Solana activity
* Detects suspicious wallet behavior (e.g., Sybil clusters)
* Computes deterministic trust scores
* Writes composable trust attestations on-chain
* Enables other protocols to enforce trust thresholds via CPI

The system includes:

1. **Veritas Program** (Anchor / Rust) — On-chain trust registry
2. **Airdrop Guard Program** (Anchor / Rust) — Demonstrates composability
3. **Autonomous Agent** (TypeScript) — Observes, analyzes, attests

All components must be fully open source.

---

# 2. System Architecture

```
Solana Devnet
     ↑
Veritas Program (Trust Primitive)
     ↑
Airdrop Guard Program (CPI Consumer)
     ↑
Autonomous Agent (Observe → Analyze → Attest)
     ↑
RPC / Block Polling
```

---

# 3. Veritas Program (Trust Oracle)

## 3.1 Framework

* Rust
* Anchor
* Deployed to Devnet

---

## 3.2 PDA Design

Each wallet has a dedicated TrustAccount PDA.

Seeds:

```rust
["trust", wallet_pubkey]
```

---

## 3.3 Account Structure

```rust
#[account]
pub struct TrustAccount {
    pub address: Pubkey,
    pub score: u8,          // 0–100
    pub last_updated: i64,  // Unix timestamp
    pub flags: u32,         // Bitmask for risk signals
}
```

---

## 3.4 Flags Bitmask

```
1 << 0  → WASH_TRADING
1 << 1  → BOT_ACTIVITY
1 << 2  → SYBIL_CLUSTER
1 << 3  → MIXER_INTERACTION
1 << 4  → HIGH_FAILURE_RATE
```

Bitmask chosen for:

* Storage efficiency
* CPI-friendly checks
* Low compute cost

---

## 3.5 Instructions

### initialize_trust_account

Creates TrustAccount PDA.

### update_score

Parameters:

```rust
pub fn update_score(
    ctx: Context<UpdateScore>,
    score: u8,
    flags: u32,
)
```

Constraints:

* Only callable by Agent Authority signer
* Score must be 0–100
* Automatically updates `last_updated`

---

## 3.6 Security Constraints

* Hardcode Agent Authority public key in program
* Validate signer on every update
* Prevent PDA reinitialization
* Ensure score bounds enforcement

---

# 4. Airdrop Guard Program (Composable Demo)

Purpose:

Demonstrate real composability via CPI-like trust enforcement.

---

## 4.1 Account Structure

```rust
#[account]
pub struct AirdropConfig {
    pub authority: Pubkey,
    pub min_score_required: u8,
}
```

---

## 4.2 Claim Instruction

Required accounts:

* claimer (Signer)
* trust_account (PDA from Veritas)
* airdrop_config
* treasury_wallet
* system_program

---

## 4.3 Claim Logic

```rust
require!(
    trust_account.score >= airdrop_config.min_score_required,
    AirdropError::LowTrustScore
);

system_program::transfer(
    treasury_wallet,
    claimer,
    AIRDROP_AMOUNT
);
```

---

## 4.4 Trust Validation

The program must verify:

* trust_account.owner == Veritas Program ID
* PDA seeds match ["trust", claimer]

This prevents spoofed accounts.

---

# 5. Autonomous Agent Specification

Language: TypeScript
Runtime: Node.js
Deployment: GitHub Actions (scheduled)

---

# 6. Core Agent Loop

```
Observe → Analyze → Score → Flag → Attest → Log
```

Pseudo:

```
while (true):
    events = fetch_recent_blocks()
    wallets = extract_candidate_wallets(events)
    for wallet in wallets:
        features = compute_features(wallet)
        score, flags = compute_score(features)
        write_onchain(wallet, score, flags)
    sleep(interval)
```

For GitHub Actions:

* Run every 5 minutes
* Process batch
* Exit

---

# 7. Event Detection Scope (MVP)

Focus on Sybil detection.

Trigger condition:

* Wallet age < threshold
* Same funding source
* Multiple wallets funded within short window
* Rapid identical interaction (airdrop claim)

---

# 8. Feature Extraction

For each wallet:

* Account age
* Recent transaction count
* Unique funding source
* Failed transaction ratio
* Burst activity detection

Limit:

* Last 100–200 transactions max

Avoid:

* Full chain scanning

---

# 9. Deterministic Scoring Model

Base score: 100

Subtract:

* Failed ratio × weight
* Sybil penalty
* Mixer interaction penalty
* Burst penalty

Clamp:

```
score = max(0, min(100, score))
```

Flags set according to triggered heuristics.

LLM (optional) generates explanation only.
Score must remain deterministic.

---

# 10. Adaptive Heuristics (Optional)

Maintain:

```
/data/heuristics.json
```

If high-score wallet later flagged:

* Adjust internal weights slightly
* Cap weight changes ±5%
* Log all updates

No full ML training required.

---

# 11. Sybil Attack Demo Scenario

## Setup

* 1 funding wallet
* 50 fresh wallets
* Mock airdrop contract deployed

## Simulation

1. Funding wallet sends SOL to 50 wallets.
2. Wallets attempt airdrop claim.
3. Agent detects funding cluster.
4. Agent writes TrustAccounts:

   * score = 10
   * flags |= SYBIL_CLUSTER
5. Airdrop rejects claims.

## Expected Outcome

* All Sybil wallets rejected.
* Normal wallet succeeds.

---

# 12. Repository Structure

```
/programs
  /veritas
  /airdrop

/agent
  observer.ts
  featureExtractor.ts
  scorer.ts
  executor.ts
  loop.ts

/scripts
  simulate_sybil.ts

/docs
  ARCHITECTURE.md
  DEMO.md
```

---

# 13. Hosting Strategy

* Programs deployed to Devnet
* Agent runs via GitHub Actions cron
* Uses public RPC or free-tier provider
* No paid infrastructure

---

# 14. Non-Goals

* No complex ML training
* No full SPL token minting logic
* No deep graph clustering
* No mainnet deployment required

---

# 15. Definition of Done

Project is complete when:

* Veritas program deployed
* Airdrop program deployed
* Agent runs autonomously
* Agent detects Sybil cluster
* TrustAccounts updated on-chain
* Airdrop rejects flagged wallets
* Repository fully open source
* Demo reproducible from README

---

# 16. Why This Meets Competition Criteria

* Fully autonomous agent
* Meaningful Solana usage (PDAs, state mutation, composability)
* On-chain primitive usable by other protocols
* Demonstrated real-time defense
* Open source reproducibility
* Economic extension possible (refresh fees)

---

If you want, I can now generate:

* `ARCHITECTURE.md`
* `DEMO.md`
* Or a 72-hour execution checklist optimized for speed.
