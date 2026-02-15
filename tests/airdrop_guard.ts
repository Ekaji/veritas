import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirdropGuard } from "../target/types/airdrop_guard";
import { Veritas } from "../target/types/veritas";
import { expect } from "chai";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

describe("airdrop_guard", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const guardProgram = anchor.workspace.AirdropGuard as Program<AirdropGuard>;
  const veritasProgram = anchor.workspace.Veritas as Program<Veritas>;

  const treasury = Keypair.generate();
  const configKeypair = Keypair.generate();
  const minScore = 60;

  before(async () => {
    // Fund the treasury with 1 SOL for claim payouts
    const sig = await provider.connection.requestAirdrop(
      treasury.publicKey,
      1 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  describe("initialize_config", () => {
    it("initializes the airdrop config", async () => {
      const tx = await guardProgram.methods
        .initializeConfig(minScore)
        .accounts({
          config: configKeypair.publicKey,
          authority: provider.wallet.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([configKeypair])
        .rpc();

      console.log("    Initialize config tx:", tx);

      const config = await guardProgram.account.airdropConfig.fetch(
        configKeypair.publicKey,
      );
      expect(config.authority.toBase58()).to.equal(
        provider.wallet.publicKey.toBase58(),
      );
      expect(config.minScoreRequired).to.equal(minScore);
      expect(config.treasury.toBase58()).to.equal(
        treasury.publicKey.toBase58(),
      );
    });
  });

  describe("claim", () => {
    it("allows claim when trust score meets minimum", async () => {
      // Use the provider wallet as the claimer
      const claimer = provider.wallet;

      // 1. Initialize a trust account for the claimer via Veritas
      const [trustPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("trust"), claimer.publicKey.toBuffer()],
        veritasProgram.programId,
      );

      await veritasProgram.methods
        .initializeTrustAccount()
        .accounts({
          trustAccount: trustPda,
          wallet: claimer.publicKey,
          authority: claimer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Trust account starts at score 100 (default) — well above minScore 60

      // 2. Get balances before claim
      const claimerBalanceBefore = await provider.connection.getBalance(
        claimer.publicKey,
      );

      // 3. Claim the airdrop
      const tx = await guardProgram.methods
        .claim()
        .accounts({
          claimer: claimer.publicKey,
          trustAccount: trustPda,
          config: configKeypair.publicKey,
          treasury: treasury.publicKey,
          veritasProgram: veritasProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([treasury])
        .rpc();

      console.log("    Claim tx:", tx);

      // 4. Verify SOL was transferred (0.1 SOL = 100_000_000 lamports)
      const claimerBalanceAfter = await provider.connection.getBalance(
        claimer.publicKey,
      );
      // Account for tx fees — claimer should have gained ~0.1 SOL minus fees
      const gained = claimerBalanceAfter - claimerBalanceBefore;
      // The gain will be slightly less than 100_000_000 due to tx fee
      expect(gained).to.be.greaterThan(90_000_000);
      expect(gained).to.be.lessThanOrEqual(100_000_000);
    });

    it("rejects claim when trust score is below minimum", async () => {
      // Create a new wallet with low trust score
      const lowTrustWallet = Keypair.generate();

      // Fund the wallet so it can pay for transactions
      const sig = await provider.connection.requestAirdrop(
        lowTrustWallet.publicKey,
        0.5 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);

      // 1. Initialize trust account for the low-trust wallet
      const [trustPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("trust"), lowTrustWallet.publicKey.toBuffer()],
        veritasProgram.programId,
      );

      await veritasProgram.methods
        .initializeTrustAccount()
        .accounts({
          trustAccount: trustPda,
          wallet: lowTrustWallet.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2. Lower the trust score to 30 (below the minScore of 60)
      await veritasProgram.methods
        .updateScore(30, 5)
        .accounts({
          trustAccount: trustPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      // Verify the score is 30
      const trust = await veritasProgram.account.trustAccount.fetch(trustPda);
      expect(trust.score).to.equal(30);

      // 3. Attempt claim — should fail
      try {
        await guardProgram.methods
          .claim()
          .accounts({
            claimer: lowTrustWallet.publicKey,
            trustAccount: trustPda,
            config: configKeypair.publicKey,
            treasury: treasury.publicKey,
            veritasProgram: veritasProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .signers([lowTrustWallet, treasury])
          .rpc();

        expect.fail("Expected claim to be rejected due to low trust score");
      } catch (err: any) {
        const anchorError = err as anchor.AnchorError;
        expect(anchorError.error.errorCode.code).to.equal("LowTrustScore");
        expect(anchorError.error.errorCode.number).to.equal(6000);
      }
    });

    it("allows claim at exactly the minimum score threshold", async () => {
      const edgeWallet = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(
        edgeWallet.publicKey,
        0.5 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);

      // Initialize trust account
      const [trustPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("trust"), edgeWallet.publicKey.toBuffer()],
        veritasProgram.programId,
      );

      await veritasProgram.methods
        .initializeTrustAccount()
        .accounts({
          trustAccount: trustPda,
          wallet: edgeWallet.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Set score to exactly minScore (60)
      await veritasProgram.methods
        .updateScore(minScore, 0)
        .accounts({
          trustAccount: trustPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      // Fund treasury again to cover payout
      const sig2 = await provider.connection.requestAirdrop(
        treasury.publicKey,
        0.5 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig2);

      // Claim should succeed at exactly threshold
      const tx = await guardProgram.methods
        .claim()
        .accounts({
          claimer: edgeWallet.publicKey,
          trustAccount: trustPda,
          config: configKeypair.publicKey,
          treasury: treasury.publicKey,
          veritasProgram: veritasProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([edgeWallet, treasury])
        .rpc();

      console.log("    Edge case claim tx:", tx);
    });

    it("rejects claim at one below the minimum score threshold", async () => {
      const belowEdgeWallet = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(
        belowEdgeWallet.publicKey,
        0.5 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);

      const [trustPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("trust"), belowEdgeWallet.publicKey.toBuffer()],
        veritasProgram.programId,
      );

      await veritasProgram.methods
        .initializeTrustAccount()
        .accounts({
          trustAccount: trustPda,
          wallet: belowEdgeWallet.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Set score to minScore - 1 (59)
      await veritasProgram.methods
        .updateScore(minScore - 1, 0)
        .accounts({
          trustAccount: trustPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      try {
        await guardProgram.methods
          .claim()
          .accounts({
            claimer: belowEdgeWallet.publicKey,
            trustAccount: trustPda,
            config: configKeypair.publicKey,
            treasury: treasury.publicKey,
            veritasProgram: veritasProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .signers([belowEdgeWallet, treasury])
          .rpc();

        expect.fail("Expected claim to be rejected");
      } catch (err: any) {
        const anchorError = err as anchor.AnchorError;
        expect(anchorError.error.errorCode.code).to.equal("LowTrustScore");
      }
    });
  });
});
