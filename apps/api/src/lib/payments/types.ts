export type Rail = "eth" | "btc" | "xrp" | "pi";

export type VerifyRequest = {
  rail: Rail;
  listingId: string;

  // buyer in your system: EVM address (auth identity)
  buyerAddress: string;

  // txHash/txid/paymentId depending on rail
  txId: string;

  // EVM only
  chainId?: number;

  // Optional memo/tag/destinationTag (XRP) if you choose to use it later
  memo?: string;
  destinationTag?: number;
};

export type VerifyResult =
  | {
      ok: true;
      canonicalId: string; // normalized tx hash / payment id
      amountAtomic: string; // bigint string in atomic units (wei/sats/drops/pi smallest unit)
      confirmations: number;
      meta?: any;
    }
  | {
      ok: false;
      reason: string;
      meta?: any;
    };

export interface PaymentVerifier {
  verify(
    req: VerifyRequest,
    expected: {
      // treasury / destination account for the rail
      treasury: string;

      // minimum amount required (atomic units) as string bigint
      minAtomic: string;

      // minimum confirmations / ledger finality depth
      minConfirmations: number;

      // optional: token address etc
      extras?: Record<string, any>;
    }
  ): Promise<VerifyResult>;
}
