/**
 * @file The wallet of the rules: adding what a sale or an order pays. The merge rules and the
 * orders both pay into it.
 */
import type { Wallet } from "@core/types";

/**
 * Adds counters to a wallet and returns a new wallet. A counter the wallet does not carry yet
 * starts at zero. The input wallet is not mutated.
 *
 * @param wallet - The wallet to copy from.
 * @param gains - The counters to add, for example `{ coins: 25 }`.
 * @returns A new wallet with the gains added.
 * @example
 * ```ts
 * const wallet = addToWallet(state.wallet, { coins: 25 });
 * ```
 */
export function addToWallet(wallet: Wallet, gains: Wallet): Wallet {
  const next: Wallet = { ...wallet };

  for (const [name, amount] of Object.entries(gains)) next[name] = (next[name] ?? 0) + amount;

  return next;
}
