import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Veritas } from "../target/types/veritas";
import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

describe("veritas", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Veritas as Program<Veritas>;
  const wallet = Keypair.generate(); // The wallet being scored

  let trustAccountPda: PublicKey;
  let trustAccountBump: number;

  before(async () => {
    // Derive PDA for the wallet's trust account
    [trustAccountPda, trustAccountBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("trust"), wallet.publicKey.toBuffer()],
      program.programId,
    );
  });

  describe("initialize_trust_account", () => {
    it("initializes a trust account with default score of 100", async () => {
      const tx = await program.methods
        .initializeTrustAccount()
        .accounts({
          trustAccount: trustAccountPda,
          wallet: wallet.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("    Initialize tx:", tx);

      // Fetch and verify the account
      const account = await program.account.trustAccount.fetch(trustAccountPda);
      expect(account.address.toBase58()).to.equal(wallet.publicKey.toBase58());
      expect(account.score).to.equal(100);
      expect(account.flags).to.equal(0);
      expect(account.lastUpdated.toNumber()).to.be.greaterThan(0);
    });

    it("fails to re-initialize an existing trust account", async () => {
      try {
        await program.methods
          .initializeTrustAccount()
          .accounts({
            trustAccount: trustAccountPda,
            wallet: wallet.publicKey,
            authority: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        // Should not reach here
        expect.fail("Expected transaction to fail");
      } catch (err: any) {
        // Account already exists — Anchor/runtime should reject the init
        expect(err).to.exist;
      }
    });
  });

  describe("update_score", () => {
    it("updates score to a valid value", async () => {
      const newScore = 75;
      const newFlags = 3; // e.g. FLAG_MULTI_WALLET | FLAG_RAPID_TRANSFERS

      const tx = await program.methods
        .updateScore(newScore, newFlags)
        .accounts({
          trustAccount: trustAccountPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      console.log("    Update score tx:", tx);

      const account = await program.account.trustAccount.fetch(trustAccountPda);
      expect(account.score).to.equal(newScore);
      expect(account.flags).to.equal(newFlags);
    });

    it("updates score to 0 (minimum)", async () => {
      const tx = await program.methods
        .updateScore(0, 7)
        .accounts({
          trustAccount: trustAccountPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      const account = await program.account.trustAccount.fetch(trustAccountPda);
      expect(account.score).to.equal(0);
      expect(account.flags).to.equal(7);
    });

    it("updates score to 100 (maximum)", async () => {
      const tx = await program.methods
        .updateScore(100, 0)
        .accounts({
          trustAccount: trustAccountPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      const account = await program.account.trustAccount.fetch(trustAccountPda);
      expect(account.score).to.equal(100);
      expect(account.flags).to.equal(0);
    });

    it("rejects score above 100", async () => {
      try {
        await program.methods
          .updateScore(101, 0)
          .accounts({
            trustAccount: trustAccountPda,
            authority: provider.wallet.publicKey,
          })
          .rpc();

        expect.fail("Expected transaction to fail with InvalidScore");
      } catch (err: any) {
        // Anchor wraps the error — check for the custom error code
        const anchorError = err as anchor.AnchorError;
        expect(anchorError.error.errorCode.code).to.equal("InvalidScore");
        expect(anchorError.error.errorCode.number).to.equal(6000);
      }
    });

    it("updates last_updated timestamp on each call", async () => {
      const accountBefore =
        await program.account.trustAccount.fetch(trustAccountPda);

      // Small delay to ensure timestamp differs
      await new Promise((resolve) => setTimeout(resolve, 1500));

      await program.methods
        .updateScore(50, 0)
        .accounts({
          trustAccount: trustAccountPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      const accountAfter =
        await program.account.trustAccount.fetch(trustAccountPda);
      expect(accountAfter.lastUpdated.toNumber()).to.be.greaterThanOrEqual(
        accountBefore.lastUpdated.toNumber(),
      );
      expect(accountAfter.score).to.equal(50);
    });
  });

  describe("multiple wallets", () => {
    it("creates separate trust accounts for different wallets", async () => {
      const wallet2 = Keypair.generate();
      const [pda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("trust"), wallet2.publicKey.toBuffer()],
        program.programId,
      );

      await program.methods
        .initializeTrustAccount()
        .accounts({
          trustAccount: pda2,
          wallet: wallet2.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const account2 = await program.account.trustAccount.fetch(pda2);
      expect(account2.address.toBase58()).to.equal(
        wallet2.publicKey.toBase58(),
      );
      expect(account2.score).to.equal(100); // Default

      // Original account should be unchanged at score 50 from previous test
      const account1 =
        await program.account.trustAccount.fetch(trustAccountPda);
      expect(account1.score).to.equal(50);
    });
  });
});
