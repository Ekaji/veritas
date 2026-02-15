import { WalletFeatures } from "./featureExtractor";

export const FLAGS = {
  WASH_TRADING: 1 << 0,
  BOT_ACTIVITY: 1 << 1,
  SYBIL_CLUSTER: 1 << 2,
  MIXER_INTERACTION: 1 << 3,
  HIGH_FAILURE_RATE: 1 << 4,
};

export interface ScoreResult {
  score: number;
  flags: number;
}

export class Scorer {
  compute(features: WalletFeatures): ScoreResult {
    let score = 100;
    let flags = 0;

    // Penalty: High Failure Rate (> 20%)
    if (features.failedTxRatio > 0.2) {
      score -= 20;
      flags |= FLAGS.HIGH_FAILURE_RATE;
    }

    // Penalty: Young Account (< 1 hour) with high activity (Burst)
    if (features.ageHours < 1 && features.burstActivity > 10) {
      score -= 30;
      flags |= FLAGS.BOT_ACTIVITY;
    }

    // Penalty: Sybil Cluster (Simulated flag for MVP)
    if (features.hasSameFundingSource) {
      score -= 50;
      flags |= FLAGS.SYBIL_CLUSTER;
    }

    // Additional Sybil heuristic: Very young account + minimal history
    if (features.ageHours < 0.1 && features.txCount < 5) {
      // Suspect
      score -= 10;
    }

    // Clamp score
    score = Math.max(0, Math.min(100, Math.floor(score)));

    return { score, flags };
  }
}
