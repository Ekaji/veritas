import { Observer } from "./observer";
import { FeatureExtractor } from "./featureExtractor";
import { Scorer } from "./scorer";
import { Executor } from "./executor";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.PROGRAM_ID || "11111111111111111111111111111111"; // Placeholder
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || "300000"); // 5 mins

async function runCallback() {
  console.log(`[AGENT] Starting run at ${new Date().toISOString()}`);

  const observer = new Observer(RPC_URL);
  const featureExtractor = new FeatureExtractor(observer.connection);
  const scorer = new Scorer();
  const executor = new Executor(observer.connection, PROGRAM_ID);

  // 1. Observe
  const wallets = await observer.getRecentWallets(50);
  console.log(`[AGENT] Found ${wallets.length} active wallets`);

  for (const wallet of wallets) {
    try {
      // 2. Extract Features
      const features = await featureExtractor.extract(wallet);

      // 3. Score
      const result = scorer.compute(features);

      // 4. Attest (Execute)
      if (result.flags !== 0 || result.score < 50) {
        console.log(`[AGENT] Flagging suspicious wallet: ${wallet}`);
        await executor.attest(wallet, result);
      } else {
        // Optionally attest good behavior too, or skip to save gas
        // For now, logging only
        console.log(
          `[AGENT] Wallet ${wallet} is clean. Score: ${result.score}`,
        );
      }
    } catch (err) {
      console.error(`[AGENT] Error processing wallet ${wallet}:`, err);
    }
  }

  console.log(`[AGENT] Run complete.`);
}

async function main() {
  const singleRun = process.argv.includes("--single-run");

  if (singleRun) {
    await runCallback();
    process.exit(0);
  } else {
    // Loop
    runCallback();
    setInterval(runCallback, INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
