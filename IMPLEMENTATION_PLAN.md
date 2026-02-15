# Veritas — Execution Plan

An autonomous on-chain trust oracle for Solana that detects Sybil clusters, computes deterministic trust scores, and writes composable attestations on-chain.

---

## Notes

> [!IMPORTANT]
> **Windows Environment**: Anchor/Solana tooling has limited native Windows support. The recommended approach is to use **WSL 2 (Ubuntu)**. All Rust/Anchor/Solana commands in this plan assume a Linux-like environment.

> [!IMPORTANT]
> **Devnet Wallet**: We will need a funded Devnet wallet for the Agent Authority. The plan generates a new keypair and airdrops SOL on Devnet. No real funds are required.

---

## Phase 1 — Environment & Project Setup

### Prerequisites (inside WSL 2 / Linux)

| Tool       | Version | Install                                                                                                       |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| Rust       | stable  | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh`                                             |
| Solana CLI | 1.18+   | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`                                               |
| Anchor CLI | 0.30+   | `cargo install --git https://github.com/coral-xyz/anchor avm --force && avm install latest && avm use latest` |
| Node.js    | 18+     | `nvm install 18`                                                                                              |
| Yarn       | 1.x     | `npm install -g yarn`                                                                                         |

---

### Project Scaffolding

#### [NEW] Anchor workspace (root)

Scaffold via `anchor init veritas_workspace --no-git` (we already have git), then restructure:

```
veritas/
├── Anchor.toml
├── Cargo.toml                   # workspace members
├── programs/
│   ├── veritas/                 # Trust oracle program
│   │   ├── Cargo.toml
│   │   └── src/
│   │       └── lib.rs
│   └── airdrop_guard/           # Composable demo program
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs
├── agent/                       # TypeScript autonomous agent
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── observer.ts
│       ├── featureExtractor.ts
│       ├── scorer.ts
│       ├── executor.ts
│       └── loop.ts
├── tests/                       # Anchor integration tests (TS)
│   ├── veritas.ts
│   └── airdrop_guard.ts
├── scripts/
│   └── simulate_sybil.ts
├── docs/
│   ├── ARCHITECTURE.md
│   └── DEMO.md
├── .github/
│   └── workflows/
│       └── agent-cron.yml
├── .gitignore
├── README.md
├── LICENSE                      # MIT
├── PROJECT_DESCRIPTION.md       # (existing)
└── PROJECT_SPECIFICATION.md     # (existing)
```

#### [NEW] Anchor.toml

- Configure `[programs.devnet]` with program IDs for both `veritas` and `airdrop_guard`
- Set `cluster = "devnet"` and `wallet` path
- Define `[scripts]` for test commands

#### [NEW] .gitignore

- Standard Rust/Anchor ignores: `target/`, `.anchor/`, `node_modules/`, `test-ledger/`

---

## Phase 2 — Veritas Program (Trust Oracle)

### [NEW] programs/veritas/src/lib.rs

The core on-chain trust registry. Key design:

**Account: `TrustAccount` (PDA)**

```rust
#[account]
pub struct TrustAccount {
    pub address: Pubkey,       // 32 bytes — the wallet being scored
    pub score: u8,             // 1 byte  — 0–100
    pub last_updated: i64,     // 8 bytes — Unix timestamp
    pub flags: u32,            // 4 bytes — risk signal bitmask
}
// Total: 8 (discriminator) + 32 + 1 + 8 + 4 = 53 bytes
```

**PDA seeds**: `["trust", wallet_pubkey.as_ref()]`

**Flags bitmask**:
| Bit | Flag |
|-----|------|
| `1 << 0` | `WASH_TRADING` |
| `1 << 1` | `BOT_ACTIVITY` |
| `1 << 2` | `SYBIL_CLUSTER` |
| `1 << 3` | `MIXER_INTERACTION` |
| `1 << 4` | `HIGH_FAILURE_RATE` |

**Instructions**:

1. `initialize_trust_account(wallet: Pubkey)`
   - Creates PDA for the given wallet
   - Sets `score = 100`, `flags = 0`, `last_updated = now`
   - Payer: Agent Authority (signer)

2. `update_score(score: u8, flags: u32)`
   - Requires Agent Authority signer
   - Validates `score <= 100`
   - Updates `score`, `flags`, and `last_updated`

**Security**:

- Agent Authority pubkey hardcoded as a constant (or stored in a config PDA for flexibility)
- Signer check on all mutating instructions
- `init` constraint prevents PDA reinitialization

---

## Phase 3 — Airdrop Guard Program (Composable Demo)

### [NEW] programs/airdrop_guard/src/lib.rs

Demonstrates composability by reading Veritas trust data.

**Account: `AirdropConfig`**

```rust
#[account]
pub struct AirdropConfig {
    pub authority: Pubkey,         // Admin who can update config
    pub min_score_required: u8,    // Minimum trust score for claim
    pub treasury: Pubkey,          // Wallet holding airdrop funds
}
```

**Instructions**:

1. `initialize_config(min_score: u8)`
   - Creates config PDA
   - Sets authority, min_score, treasury

2. `claim()`
   - Required accounts: claimer (signer), `trust_account` (Veritas PDA), `airdrop_config`, `treasury`, `system_program`
   - **Validation**:
     - Verify `trust_account.owner == veritas_program_id`
     - Verify PDA seeds match `["trust", claimer.key()]`
     - `require!(trust_account.score >= config.min_score_required)`
   - On success: SOL transfer from treasury to claimer

---

## Phase 4 — Autonomous Agent (TypeScript)

### [NEW] agent/package.json

Dependencies:

- `@solana/web3.js` — RPC, transactions
- `@coral-xyz/anchor` — IDL-based program interaction
- `dotenv` — environment configuration

### Agent Modules

#### [NEW] agent/src/observer.ts

- Polls recent blocks via `getBlocksWithLimit` / `getBlock`
- Extracts unique wallets from transactions
- Filters candidates (e.g., fresh wallets with low transaction count)
- Rate-limit aware with exponential backoff

#### [NEW] agent/src/featureExtractor.ts

For each candidate wallet, compute:

- **Account age** — first transaction timestamp vs. now
- **Transaction count** — last 100–200 txs
- **Funding source analysis** — trace initial SOL transfer
- **Failed tx ratio** — `failed / total`
- **Burst activity** — transactions per minute in recent window

#### [NEW] agent/src/scorer.ts

Deterministic scoring model:

```
base = 100
score -= failedRatio * WEIGHT_FAIL        (e.g., 30)
score -= sybilPenalty                       (e.g., 40 if same funder + young age)
score -= mixerPenalty                       (e.g., 20)
score -= burstPenalty                       (e.g., 15)
score = clamp(0, 100, score)
```

Returns `{ score: number, flags: number }`.

#### [NEW] agent/src/executor.ts

- Loads Anchor program IDL
- For each scored wallet:
  - If no TrustAccount exists → call `initialize_trust_account`
  - Call `update_score(score, flags)`
- Batches transactions where possible
- Logs all on-chain writes

#### [NEW] agent/src/loop.ts

Entry point:

```
observe() → extract features → score → execute → log
```

- For GitHub Actions: single-pass mode (run once, exit)
- For local dev: continuous loop with configurable interval

---

## Phase 5 — Sybil Simulation & Demo

### [NEW] scripts/simulate_sybil.ts

End-to-end demo script:

1. Generate 1 funding wallet + 50 Sybil wallets
2. Airdrop SOL to funding wallet
3. Funding wallet distributes to all 50 wallets
4. Run the agent to analyze these wallets
5. Agent writes `TrustAccount`s with `score ≈ 10`, `flags |= SYBIL_CLUSTER`
6. Each Sybil wallet attempts `claim()` on Airdrop Guard → **rejected**
7. A legitimate wallet (separate funder, older) attempts `claim()` → **succeeds**
8. Print summary table

---

## Phase 6 — Documentation & CI

### [NEW] README.md

- Product description & why it's novel
- Architecture overview
- How Solana is used
- How the AI agent operates autonomously
- Setup & run instructions
- Demo instructions

### [NEW] docs/ARCHITECTURE.md

- System diagram
- Program design decisions
- Agent pipeline details

### [NEW] docs/DEMO.md

- Step-by-step demo walkthrough
- Expected output

### [NEW] .github/workflows/agent-cron.yml

```yaml
on:
  schedule:
    - cron: "*/5 * * * *" # every 5 minutes
  workflow_dispatch: {} # manual trigger
```

- Checkout repo
- Install Node.js + dependencies
- Run `agent/src/loop.ts` in single-pass mode

---

## Verification Plan

### Automated Tests

**Anchor Program Tests** (run via `anchor test`):

1. **Veritas program**:
   - ✅ `initialize_trust_account` creates PDA with correct initial values
   - ✅ `update_score` updates score, flags, and timestamp
   - ❌ `update_score` rejects unauthorized signer
   - ❌ `update_score` rejects score > 100
   - ❌ `initialize_trust_account` rejects double-init

2. **Airdrop Guard program**:
   - ✅ `initialize_config` creates config
   - ✅ `claim` succeeds when trust score ≥ threshold
   - ❌ `claim` fails when trust score < threshold
   - ❌ `claim` fails with spoofed trust account (wrong owner/seeds)

**Agent Unit Tests** (run via `cd agent && npm test`):

- `scorer.ts` — deterministic output for known inputs
- `featureExtractor.ts` — correct feature computation from mock data

### Integration / E2E Test

**Sybil simulation** (run via `ts-node scripts/simulate_sybil.ts`):

- Verifies the full pipeline: fund → detect → score → attest → reject
- Expected: all 50 Sybil wallets rejected, 1 legitimate wallet succeeds

### Manual Verification

- Deploy both programs to Devnet and confirm via Solana Explorer
- Run the agent locally and verify TrustAccount PDAs are created on-chain
- Trigger the GitHub Actions workflow manually and confirm it completes

---

## Execution Order

```
Phase 1: Environment & Scaffold
    ├──→ Phase 2: Veritas Program
    │        ├──→ Phase 3: Airdrop Guard Program ──→ Phase 5: Sybil Simulation
    │        └──→ Phase 4: Agent TypeScript ───────→ Phase 5: Sybil Simulation
    └──→ Phase 6: Docs & CI
```

Phases 2→3 and 2→4 can run in parallel once scaffolding is done.
