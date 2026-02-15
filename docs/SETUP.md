# Veritas — Development Setup

## Prerequisites

| Tool           | Required Version | Install Guide                                                             |
| -------------- | ---------------- | ------------------------------------------------------------------------- |
| **WSL**        | Ubuntu 24.04+    | `wsl --install -d Ubuntu-24.04`                                           |
| **Rust**       | 1.93+            | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh`         |
| **Solana CLI** | 3.x (Agave)      | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`           |
| **Anchor CLI** | 0.32.1           | See [Anchor Installation](#anchor-cli)                                    |
| **Node.js**    | 20+              | Pre-installed on Ubuntu 24.04 or via [nvm](https://github.com/nvm-sh/nvm) |
| **Yarn**       | 1.x              | `npm install -g yarn`                                                     |

## Step-by-Step Installation

### 1. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Accept defaults (option 1)
source "$HOME/.cargo/env"

# Verify
rustc --version   # Expected: rustc 1.93.x
cargo --version
```

### 2. Solana CLI

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Add to PATH (if not already)
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Verify
solana --version   # Expected: solana-cli 3.x

# Configure for devnet
solana config set --url devnet

# Generate a keypair (if you don't have one)
solana-keygen new --no-bip39-passphrase
```

> [!IMPORTANT]
> Save your keypair seed phrase. The keypair is stored at `~/.config/solana/id.json`.

### 3. Anchor CLI

```bash
# Install AVM (Anchor Version Manager)
cargo install --git https://github.com/coral-xyz/anchor avm --force

# Install and activate Anchor 0.32.1
avm install 0.32.1
avm use 0.32.1

# Verify
anchor --version   # Expected: anchor-cli 0.32.1
```

### 4. Node.js & Yarn

```bash
# Check Node (should be pre-installed on Ubuntu 24.04)
node --version   # Expected: v20+

# Install Yarn globally
npm install -g yarn
yarn --version
```

## Project Setup

```bash
# Clone the repo (if you haven't)
cd ~/projects/veritas

# Install root test dependencies
npm install

# Install agent dependencies
cd agent && npm install && cd ..

# Install script dependencies
cd scripts && npm install && cd ..
```

## Build & Test

```bash
# Build both programs
anchor build

# Run tests (spins up a local validator automatically)
anchor test
```

## Deploying to Devnet

```bash
# Ensure you have SOL for deployment
solana airdrop 2

# Deploy
anchor deploy

# The output will show new Program IDs — update them in:
# 1. Anchor.toml       → [programs.devnet] section
# 2. programs/veritas/src/lib.rs    → declare_id!()
# 3. programs/airdrop_guard/src/lib.rs  → declare_id!()
# 4. agent/.env         → PROGRAM_ID

# Rebuild after updating IDs
anchor build
```

## Troubleshooting

| Issue                          | Solution                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `GLIBC_2.39 not found`         | Upgrade WSL to Ubuntu 24.04: `sudo do-release-upgrade`                         |
| `anchor: command not found`    | Add `~/.avm/bin` to PATH: `export PATH="$HOME/.avm/bin:$PATH"`                 |
| `solana: command not found`    | Re-run the Solana installer or add to PATH                                     |
| `os error 2` on `anchor build` | Generate a keypair: `solana-keygen new --no-bip39-passphrase`                  |
| `idl-build feature missing`    | Add `idl-build = ["anchor-lang/idl-build"]` to both program `Cargo.toml` files |
| SSL/TLS download errors        | Try `wget --no-check-certificate` or download from GitHub releases directly    |

## Verified Working Environment

```
Ubuntu 24.04.4 LTS (WSL)
rustc 1.93.1
solana-cli 3.0.15 (Agave)
anchor-cli 0.32.1
Node.js v20.20.0
Yarn 1.x
```
