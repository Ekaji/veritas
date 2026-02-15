import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { writeFile } from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

// Funding amount per Sybil (enough for rent + fees)
const FUNDING_AMOUNT = 0.01 * LAMPORTS_PER_SOL;
const SYBIL_COUNT = 50;

async function main() {
  console.log("Starting Sybil Simulation Setup...");

  // 1. Setup Funder
  // Load main wallet (payer/authority)
  const walletPath = process.env.WALLET_PATH || "../solana-id.json";
  // Fallback if running from scripts dir
  const fs = require("fs");
  const path = require("path");
  let resolvedWalletPath = path.resolve(process.cwd(), walletPath);
  if (!fs.existsSync(resolvedWalletPath)) {
    resolvedWalletPath = path.resolve(__dirname, "../solana-id.json");
  }

  if (!fs.existsSync(resolvedWalletPath)) {
    console.error("Wallet not found at", resolvedWalletPath);
    return;
  }

  const rawKey = fs.readFileSync(resolvedWalletPath, "utf-8");
  const funder = Keypair.fromSecretKey(new Uint8Array(JSON.parse(rawKey)));
  console.log(`Funder Public Key: ${funder.publicKey.toBase58()}`);

  const bal = await connection.getBalance(funder.publicKey);
  console.log(`Funder Balance: ${bal / LAMPORTS_PER_SOL} SOL`);

  if (bal < 1 * LAMPORTS_PER_SOL) {
    console.log("Balance low. Attempting airdrop...");
    try {
      const sig = await connection.requestAirdrop(
        funder.publicKey,
        1 * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig);
      console.log("Funder airdropped 1 SOL");
    } catch (e) {
      console.error(
        "Airdrop failed. Using execution as is if balance allows.",
        e,
      );
    }
  }

  // 2. Generate Sybils
  const sybils: Keypair[] = [];
  console.log(`Generating ${SYBIL_COUNT} Sybil wallets...`);
  for (let i = 0; i < SYBIL_COUNT; i++) {
    sybils.push(Keypair.generate());
  }

  // 3. Distribute Funds
  console.log("Distributing funds to Sybils...");
  // Limit to ~5 instructions per tx to fit in packet and avoid rate limits
  const batchSize = 5;
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  for (let i = 0; i < sybils.length; i += batchSize) {
    const batch = sybils.slice(i, i + batchSize);
    const tx = new Transaction();

    for (const sybil of batch) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: funder.publicKey,
          toPubkey: sybil.publicKey,
          lamports: FUNDING_AMOUNT,
        }),
      );
    }

    try {
      const signature = await sendAndConfirmTransaction(connection, tx, [
        funder,
      ]);
      console.log(`Funded batch ${i / batchSize + 1}: ${signature}`);
      await sleep(2000); // Wait 2s between batches
    } catch (err) {
      console.error(`Error funding batch ${i / batchSize + 1}:`, err);
    }
  }

  // 4. Sybils attempt "Action" (mocking airdrop claim or just distinct txs to be visible)
  console.log("Sybils performing actions to be visible on-chain...");
  // For Observer to pick them up, they need to sign transactions.
  // We'll have them send a tiny amount back to funder (or self-transfer 0).
  for (let i = 0; i < sybils.length; i += batchSize) {
    const batch = sybils.slice(i, i + batchSize);
    // We can't easily batch disparate signers unless we are the payer.
    // Actually, we can make `funder` the payer for all of them, but that links them even more.
    // To simulate "independent" actions, each should pay its own fee.
    // This means we must send individual transactions or group carefully.

    // Sending 50 txs sequentially is slow. We'll do `Promise.all` with concurrency limit.
    const promises = batch.map(async (sybil) => {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: sybil.publicKey,
          toPubkey: sybil.publicKey, // Self-transfer
          lamports: 0,
        }),
      );
      try {
        return await sendAndConfirmTransaction(connection, tx, [sybil]);
      } catch (e) {
        console.error(`Sybil ${sybil.publicKey.toBase58()} action failed`, e);
        return null;
      }
    });

    await Promise.all(promises);
    console.log(`Batch ${i / batchSize + 1} actions complete.`);
    await sleep(2000); // Wait 2s between batches
  }

  // 5. Output Wallet List for Agent
  const walletList = sybils.map((s) => s.publicKey.toBase58());
  await writeFile("sybil_wallets.json", JSON.stringify(walletList, null, 2));
  console.log(
    "Sybil simulation setup complete. Wallet list saved to sybil_wallets.json",
  );
}

main().catch(console.error);
