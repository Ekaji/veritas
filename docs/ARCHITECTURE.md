# Veritas Architecture

Veritas is an autonomous on-chain trust oracle for Solana. It consists of three main components:

1. **Veritas Program** (Solana/Anchor): The on-chain registry of trust scores.
2. **Airdrop Guard Program** (Solana/Anchor): A demo consumer of Veritas trust scores.
3. **Autonomous Agent** (TypeScript): The off-chain observer and scorer.

## 1. Veritas Program (Trust Oracle)

### State Account: `TrustAccount`

Each wallet analyzed by the agent has a corresponding PDA `TrustAccount`.

- **Seeds**: `["trust", wallet_pubkey]`
- **Data**:
  - `address`: The wallet being scored.
  - `score`: `u8` (0-100).
  - `last_updated`: `i64` timestamp.
  - `flags`: `u32` bitmask for risk signals.

### Instructions

- `initialize_trust_account`: Creates the PDA.
- `update_score`: Updates score and flags. Protected by `authority` check (Agent's key).

### Risk Flags

| Bit | Name              | Description                                |
| --- | ----------------- | ------------------------------------------ |
| 0   | WASH_TRADING      | Suspicious volume patterns                 |
| 1   | BOT_ACTIVITY      | High frequency / inhuman timing            |
| 2   | SYBIL_CLUSTER     | Funded by same source, temporal clustering |
| 3   | MIXER_INTERACTION | Interaction with known mixers              |
| 4   | HIGH_FAILURE_RATE | High ratio of failed transactions          |

## 2. Airdrop Guard Program

Demonstrates composability.

### Logic

- **CPI/Account Read**: Reads the `TrustAccount` for a claiming wallet.
- **Validation**:
  - Checks if `TrustAccount` owner is `Veritas` program.
  - Checks if `score >= min_score_required`.
- **Action**: Transfers SOL if validation passes.

## 3. Autonomous Agent

Runs on a cron schedule (e.g., GitHub Actions every 5 min).

### Pipeline

1. **Observer**: Polls recent blocks via RPC.
2. **Feature Extractor**: Analyzes tx history for candidate wallets.
   - Computes age, tx count, failure rate, etc.
3. **Scorer**: Deterministic logic to compute scores (100 - penalties).
4. **Executor**: Submits `update_score` transactions to Solana.

### Sybil Detection Heuristic (MVP)

- Detects if multiple fresh wallets are funded by the same source within a short window.
- Flags them with `SYBIL_CLUSTER`.

## Deployment

- **Programs**: Deployed to Devnet.
- **Agent**: Runs in GitHub Actions or local server.
- **Keys**: Agent Authority keypair stored in CI secrets (or `.env` locally).
