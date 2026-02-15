import { Connection, PublicKey } from "@solana/web3.js";

export class Observer {
  connection: Connection;
  knownWallets: Set<string>;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.knownWallets = new Set();
  }

  async getRecentWallets(limit: number = 100): Promise<string[]> {
    try {
      // Get recent block slot
      const currentSlot = await this.connection.getSlot();
      // Fetch recent blocks (simplified: getting last 5 blocks)
      const blocks = await this.connection.getBlocks(
        currentSlot - 5,
        currentSlot,
      );

      const candidates: Set<string> = new Set();

      for (const slot of blocks) {
        const block = await this.connection.getBlock(slot, {
          maxSupportedTransactionVersion: 0,
        });

        if (!block || !block.transactions) continue;

        for (const tx of block.transactions) {
          // Extract signer (usually first account key)
          // In versioned tx, accountKeys is loaded differently, simplification here:
          // Extract signer (usually first account key)
          // In versioned tx, accountKeys is loaded differently, simplification here:
          const signer = tx.transaction.message.staticAccountKeys[0];
          if (signer) {
            candidates.add(signer.toString());
          }
        }
      }

      return Array.from(candidates).slice(0, limit);
    } catch (error) {
      console.error("Error observing chain:", error);
      return [];
    }
  }
}
