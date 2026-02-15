FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

USER vscode
WORKDIR /home/vscode

# 1. Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/home/vscode/.cargo/bin:${PATH}"

# 2. Install Dependencies (including libssl-dev)
RUN sudo apt-get update && sudo apt-get install -y \
    pkg-config build-essential libudev-dev libssl-dev

# 3. Install Anchor via AVM (Binary)
# Ubuntu 24.04 has glibc >= 2.39, so prebuilt binaries works.
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force \
    && avm install latest \
    && avm use latest

# 4. Install Solana CLI (after dependencies to be safe, though prebuilt)
RUN sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Add AVM and Solana binaries to PATH
ENV PATH="/home/vscode/.local/share/solana/install/active_release/bin:/home/vscode/.avm/bin:${PATH}"
