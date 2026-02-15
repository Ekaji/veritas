import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  Connection,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const VERITAS_PID = new PublicKey(
  "8r7dBmeeYTYiXtACHrFSgTYcQtUySu4WA1moGaA8uXMZ",
);
const AIRDROP_PID = new PublicKey(
  "7dr4ztcm3UKiBxgbmKPxE7uiXxag28g69ib2exu7XuRU",
);

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");

  // Load main wallet (payer/authority/treasury)
  const walletPath = process.env.WALLET_PATH || "../solana-id.json";
  let resolvedWalletPath = path.resolve(process.cwd(), walletPath);

  // Fallback lookup if running from scripts dir
  if (!fs.existsSync(resolvedWalletPath)) {
    resolvedWalletPath = path.resolve(__dirname, "../solana-id.json");
  }

  if (!fs.existsSync(resolvedWalletPath)) {
    console.error("Wallet not found at", resolvedWalletPath);
    return;
  }

  const rawKey = fs.readFileSync(resolvedWalletPath, "utf-8");
  const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(rawKey)));
  const wallet = new anchor.Wallet(keypair);

  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);

  // Load IDLs
  const veritasIdlPath = path.resolve(__dirname, "../target/idl/veritas.json");
  const airdropIdlPath = path.resolve(
    __dirname,
    "../target/idl/airdrop_guard.json",
  );

  if (!fs.existsSync(veritasIdlPath) || !fs.existsSync(airdropIdlPath)) {
    console.error("IDLs not found. Run 'anchor build' first.");
    return;
  }

  const veritasIdl = JSON.parse(fs.readFileSync(veritasIdlPath, "utf8"));
  const airdropIdl = JSON.parse(fs.readFileSync(airdropIdlPath, "utf8"));

  const veritasProgram = new Program(veritasIdl, provider);
  const airdropProgram = new Program(airdropIdl, provider);

  // --- INIT AIRDROP CONFIG (ONE TIME IF NEEDED) ---
  const configKeypairPath = path.resolve(
    __dirname,
    "airdrop_config_keypair.json",
  );
  let configKeypair: Keypair;

  if (fs.existsSync(configKeypairPath)) {
    configKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(configKeypairPath, "utf-8"))),
    );
    console.log(`Loaded Airdrop Config: ${configKeypair.publicKey.toBase58()}`);
  } else {
    configKeypair = Keypair.generate();
    fs.writeFileSync(
      configKeypairPath,
      JSON.stringify(Array.from(configKeypair.secretKey)),
    );
    console.log(
      `Generated new Airdrop Config: ${configKeypair.publicKey.toBase58()}`,
    );
  }

  // Check if config account exists on chain
  const configInfo = await connection.getAccountInfo(configKeypair.publicKey);

  if (!configInfo) {
    console.log("Initializing Airdrop Config (Min Score: 60)...");
    try {
      await airdropProgram.methods
        .initializeConfig(60)
        .accounts({
          config: configKeypair.publicKey,
          authority: wallet.publicKey,
          treasury: wallet.publicKey, // Payout from our wallet
          systemProgram: SystemProgram.programId,
        })
        .signers([configKeypair])
        .rpc();
      console.log("Config Initialized.");
    } catch (e) {
      console.error("Config Init Failed:", e);
    }
  } else {
    console.log("Airdrop Config already initialized.");
  }

  // --- CREATE CLAIMER & TEST ---
  const claimer = Keypair.generate();
  console.log(
    `\nTesting Claim with New Wallet: ${claimer.publicKey.toBase58()}`,
  );

  // Fund claimer for fees
  console.log("Funding claimer for gas...");
  try {
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: claimer.publicKey,
        lamports: 0.002 * LAMPORTS_PER_SOL,
      }),
    );
    await provider.sendAndConfirm(tx);
  } catch (e) {
    console.error("Funding failed:", e);
    return;
  }

  // Init Trust Account
  const [trustPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("trust"), claimer.publicKey.toBuffer()],
    VERITAS_PID,
  );

  console.log("Initializing Trust Account (Default Score 100)...");
  try {
    await veritasProgram.methods
      .initializeTrustAccount()
      .accounts({
        trustAccount: trustPda,
        wallet: claimer.publicKey,
        authority: wallet.publicKey, // We pay for it (simulating agent/faucet behavior)
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  } catch (e) {
    console.log("Trust account init error (maybe already exists?):", e);
  }

  // Test 1: Claim with default score (100) -> Should Succeed
  console.log("\n--- TEST 1: High Score (100) ---");
  try {
    const tx = await airdropProgram.methods
      .claim()
      .accounts({
        claimer: claimer.publicKey,
        trustAccount: trustPda,
        config: configKeypair.publicKey,
        treasury: wallet.publicKey,
        veritasProgram: VERITAS_PID,
        systemProgram: SystemProgram.programId,
      })
      .signers([claimer, wallet.payer]) // Wallet signs because it's the treasury
      .rpc();
    console.log(`✅ Claim SUCCESS! Tx: ${tx}`);
  } catch (e) {
    console.error("❌ Claim FAILED (Unexpected):", e);
  }

  // Test 2: Lower score to 10 -> Should Fail
  console.log("\n--- TEST 2: Low Score (10) ---");
  console.log("Updating score to 10...");
  await veritasProgram.methods
    .updateScore(10, 1) // Score 10, Flag 1
    .accounts({
      trustAccount: trustPda,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log("Attempting second claim...");
  try {
    await airdropProgram.methods
      .claim()
      .accounts({
        claimer: claimer.publicKey,
        trustAccount: trustPda,
        config: configKeypair.publicKey,
        treasury: wallet.publicKey,
        veritasProgram: VERITAS_PID,
        systemProgram: SystemProgram.programId,
      })
      .signers([claimer, wallet.payer])
      .rpc();
    console.log(`❌ Claim SUCCESS (Unexpected!)`);
  } catch (e: any) {
    console.log(`✅ Claim FAILED as expected. Error: ${e.message}`);
  }
}

main().catch(console.error);
