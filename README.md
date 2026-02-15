# Veritas

**Autonomous On-Chain Trust Oracle for Solana**

Veritas is an AI agent that monitors Solana for suspicious activity, computes deterministic trust scores, and attests them on-chain. Other protocols can compose with Veritas to enforce trust thresholds (e.g., for airdrops, governance, or DeFi access).

## Features

- **Autonomous Observation**: Agent monitors Devnet blocks in real-time.
- **Sybil Detection**: Identifies funding clusters and burst activity.
- **On-Chain Registry**: Stores Trust Scores (0-100) and Risk Flags in PDAs.
- **Composability**: `AirdropGuard` example program demonstrates CPI integration.

## Architecture

![Architecture](docs/architecture_diagram.png) _See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details._

- **Programs**: Anchor/Rust (`veritas`, `airdrop_guard`)
- **Agent**: TypeScript/Node.js

## Getting Started

### Prerequisites

- Rust, Solana CLI, Anchor CLI, Node.js
- WSL 2 (if on Windows)

### Installation

1. **Clone & Install**

   ```bash
   git clone <repo>
   cd veritas
   npm install
   ```

2. **Build Programs**

   ```bash
   anchor build
   ```

3. **Deploy to Devnet**
   ```bash
   anchor deploy
   ```
   _Update `Anchor.toml` and `agent/.env` with new program IDs._

### Running the Agent

```bash
cd agent
npm start
```

### Running the Demo

See [docs/DEMO.md](docs/DEMO.md) for the Sybil attack simulation.

## License

MIT
