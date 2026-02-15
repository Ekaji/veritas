import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, Idl } from "@coral-xyz/anchor";
import { ScoreResult } from "./scorer";
import fs from "fs";
import path from "path";

export class Executor {
  connection: Connection;
  programId: PublicKey;
  provider: AnchorProvider;
  program: Program;

  constructor(connection: Connection, programId: string) {
    this.connection = connection;
    this.programId = new PublicKey(programId);

    // Load wallet
    const walletPath = process.env.WALLET_PATH || "../solana-id.json";
    const resolvedPath = path.resolve(process.cwd(), walletPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Wallet not found at ${resolvedPath}`);
    }
    const keypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(resolvedPath, "utf-8"))),
    );
    const wallet = new Wallet(keypair);

    this.provider = new AnchorProvider(connection, wallet, {});

    // Load IDL
    // Assuming agent is run from agent/ directory, so ../target/idl/veritas.json is correct relative to CWD
    const idlPath = path.resolve(process.cwd(), "../target/idl/veritas.json");
    if (!fs.existsSync(idlPath)) {
      throw new Error(`IDL not found at ${idlPath}. Run anchor build first.`);
    }
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

    this.program = new Program(idl as Idl, this.provider);
  }

  async attest(walletAddress: string, result: ScoreResult) {
    console.log(
      `[EXECUTOR] Attesting for ${walletAddress}: Score ${result.score}, Flags ${result.flags}`,
    );

    try {
      const walletPubkey = new PublicKey(walletAddress);

      // Derive PDA
      const [trustPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("trust"), walletPubkey.toBuffer()],
        this.program.programId,
      );

      // Check if account exists
      const account = await this.connection.getAccountInfo(trustPda);

      if (!account) {
        console.log(
          `[EXECUTOR] Initializing trust account for ${walletAddress}...`,
        );
        await this.program.methods
          .initializeTrustAccount()
          .accounts({
            // @ts-ignore: IDL might imply different structure validation in TS
            trustAccount: trustPda,
            wallet: walletPubkey,
            authority: this.provider.wallet.publicKey,
            // systemProgram is auto-resolved by Anchor usually, but being explicit helps
          })
          .rpc();
      }

      console.log(`[EXECUTOR] Updating score...`);
      const tx = await this.program.methods
        .updateScore(result.score, result.flags)
        .accounts({
          trustAccount: trustPda,
          authority: this.provider.wallet.publicKey,
        })
        .rpc();

      console.log(`[EXECUTOR] Attestation success: ${tx}`);
    } catch (err) {
      console.error(`[EXECUTOR] Failed to attest:`, err);
    }
  }
}
