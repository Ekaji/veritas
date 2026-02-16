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
    const privateKeyEnv = process.env.PRIVATE_KEY;
    let keypair: Keypair;

    if (privateKeyEnv) {
      try {
        // Flexible parsing: handles raw JSON array or comma-separated string
        const secretKey = privateKeyEnv.trim().startsWith("[")
          ? JSON.parse(privateKeyEnv)
          : privateKeyEnv.split(",").map(Number);
        keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
      } catch (e) {
        throw new Error(
          "Invalid PRIVATE_KEY format. Must be JSON array of numbers.",
        );
      }
    } else {
      const walletPath = process.env.WALLET_PATH || "../solana-id.json";
      const resolvedPath = path.resolve(process.cwd(), walletPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(
          `Wallet not found at ${resolvedPath} and PRIVATE_KEY not set`,
        );
      }
      keypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(resolvedPath, "utf-8"))),
      );
    }

    const wallet = new Wallet(keypair);

    this.provider = new AnchorProvider(connection, wallet, {});

    // Load IDL
    // Priority: 1. Local (Docker/deployed), 2. Dev (target)
    let idlPath = path.resolve(process.cwd(), "idl/veritas.json");
    if (!fs.existsSync(idlPath)) {
      idlPath = path.resolve(process.cwd(), "../target/idl/veritas.json");
    }

    if (!fs.existsSync(idlPath)) {
      throw new Error(
        `IDL not found at ${idlPath}. Run anchor build first or copy to agent/idl/.`,
      );
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
