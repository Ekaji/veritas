import { Connection, PublicKey } from "@solana/web3.js";

export interface WalletFeatures {
  ageHours: number;
  txCount: number;
  failedTxRatio: number;
  hasSameFundingSource: boolean;
  burstActivity: number; // txs per minute
}

export class FeatureExtractor {
  connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async extract(walletAddress: string): Promise<WalletFeatures> {
    const pubkey = new PublicKey(walletAddress);

    // Fetch recent transaction history (up to 100)
    const signatures = await this.connection.getSignaturesForAddress(pubkey, {
      limit: 100,
    });

    if (signatures.length === 0) {
      return {
        ageHours: 0,
        txCount: 0,
        failedTxRatio: 0,
        hasSameFundingSource: false,
        burstActivity: 0,
      };
    }

    // 1. Account Age
    const firstTx = signatures[signatures.length - 1];
    const lastTx = signatures[0];
    const now = Date.now() / 1000;
    const ageSeconds = now - (firstTx.blockTime || now);
    const ageHours = ageSeconds / 3600;

    // 2. Tx Count
    const txCount = signatures.length;

    // 3. Failed Tx Ratio
    const failedCount = signatures.filter((sig) => sig.err).length;
    const failedTxRatio = txCount > 0 ? failedCount / txCount : 0;

    // 4. Burst Activity (Tx / Minute in the observed window)
    let burstActivity = 0;
    if (signatures.length > 1 && firstTx.blockTime && lastTx.blockTime) {
      const durationMinutes = (lastTx.blockTime - firstTx.blockTime) / 60;
      burstActivity = durationMinutes > 0 ? txCount / durationMinutes : txCount;
    }

    // 5. Funding Source (Simplified: check if first tx was a transfer from a known suspicious funding wallet)
    // In a real implementation, this would trace back the first SOL transfer.
    // For MVP/Demo: We'll flag it if the first tx is a transfer from a specific demofunder wallet (to be configured).
    const hasSameFundingSource = false; // Placeholder for now

    return {
      ageHours,
      txCount,
      failedTxRatio,
      hasSameFundingSource,
      burstActivity,
    };
  }
}
