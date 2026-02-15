# Veritas Demo Scenario

This document outlines the Sybil attack simulation and how Veritas defends against it.

## Prerequisites

1. **Devnet Wallet**: Ensure `~/.config/solana/id.json` exists and has some SOL.
2. **Environment**:
   - `veritas` and `airdrop_guard` programs deployed to Devnet.
   - `.env` configured with `RPC_URL` and `PROGRAM_ID`.

## Scenario Overview

We will simulate a **Sybil Attack** on an airdrop.

- **Attacker**: Uses one funded wallet to distribute SOL to 50 fresh wallets.
- **Goal**: The 50 Sybil wallets try to claim tokens from the `AirdropGuard` contract.
- **Defense**: Veritas Agent detects the cluster, scores the wallets, and the Airdrop contract rejects them.

## Step-by-Step Walkthrough

### 1. Start the Agent

Run the agent in background or separate terminal:

```bash
cd agent
npm start
```

_The agent will start polling blocks._

### 2. Run the Simulation Script

In another terminal:

```bash
npx ts-node scripts/simulate_sybil.ts
```

**What happens:**

- Generates a "Funder" wallet and airdrops 2 SOL to it.
- Generates 50 "Sybil" wallets.
- **Transfers 0.01 SOL** from Funder to each Sybil (creating a funding cluster).
- Sybils perform a dummy action (self-transfer) to generate on-chain activity.
- Saves wallet list to `sybil_wallets.json`.

### 3. Agent Detection

Watch the Agent logs. You should see:

- `[AGENT] Found 50 active wallets`
- `[AGENT] Flagging suspicious wallet: <Sybil_Pubkey>`
- `[EXECUTOR] Attesting... Score: 10, Flags: 4 (SYBIL_CLUSTER)`

### 4. Verify On-Chain

Check the explorer for one of the Sybil wallets.

- You will see a `TrustAccount` PDA created for it.
- **Score**: Low (e.g., 10).
- **Flags**: `SYBIL_CLUSTER` bit set.

### 5. Automated Verification (Claim Test)

Run the verification script to test the defense mechanism:

```bash
cd scripts
npx ts-node attempt_claim.ts
```

**What this script does:**

1. Creates a fresh test wallet.
2. Initializes it with a **High Trust Score (100)**.
3. **Attempts Claim** -> ✅ **SUCCESS** (Simulating a legitimate user).
4. **Updates Score** to **Low Trust Score (10)** (Simulating detection).
5. **Attempts Claim** -> ❌ **FAILED** (Error: `LowTrustScore`).

This confirms that the `AirdropGuard` contract effectively blocks wallets with low trust scores.

## Clean Up

Stop the agent with `Ctrl+C`.
