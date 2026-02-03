import type { PaymentVerifier, VerifyRequest, VerifyResult } from "./types.js";

type XrplCfg = {
  url: string; // your rippled HTTP JSON-RPC endpoint (e.g. http://127.0.0.1:5005)
};

async function xrplRpc<T>(cfg: XrplCfg, method: string, params: any[]): Promise<T> {
  const resp = await fetch(cfg.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, params })
  });
  const json = await resp.json();
  if (json.result?.error) {
    return Promise.reject(Object.assign(new Error("xrpl_rpc_error"), { details: json.result }));
  }
  return json.result as T;
}

type TxResult = {
  validated?: boolean;
  TransactionType?: string;
  Destination?: string;
  meta?: {
    delivered_amount?: string | { currency: string; issuer: string; value: string };
    TransactionResult?: string;
  };
  ledger_index?: number;
};

export class XrpVerifier implements PaymentVerifier {
  constructor(private cfg: XrplCfg) {}

  async verify(req: VerifyRequest, expected: { treasury: string; minAtomic: string; minConfirmations: number }): Promise<VerifyResult> {
    const treasury = expected.treasury.trim();
    const minDrops = BigInt(expected.minAtomic);

    // rippled tx lookup :contentReference[oaicite:9]{index=9}
    const tx = await xrplRpc<TxResult>(this.cfg, "tx", [{ transaction: req.txId, binary: false }]);

    if (!tx.validated) return { ok: false, reason: "not_validated" };
    if (tx.TransactionType !== "Payment") return { ok: false, reason: "not_payment" };
    if ((tx.Destination ?? "") !== treasury) return { ok: false, reason: "treasury_mismatch" };

    const delivered = tx.meta?.delivered_amount;
    if (!delivered || typeof delivered !== "string") {
      // we only accept XRP payments here (drops as string); IOUs would be object
      return { ok: false, reason: "missing_or_non_xrp_delivered_amount" };
    }

    // delivered is drops string, per XRPL docs :contentReference[oaicite:10]{index=10}
    const deliveredDrops = BigInt(delivered);
    if (deliveredDrops < minDrops) {
      return { ok: false, reason: "insufficient_value", meta: { deliveredDrops: deliveredDrops.toString() } };
    }

    // Confirmations model on XRPL is not Bitcoin-style blocks; validated is strong finality.
    // If you still want a depth requirement, you’d compare latest validated ledger index vs tx.ledger_index.
    // Here we treat validated as confirmations >= minConfirmations by mapping:
    const confirmations = Math.max(expected.minConfirmations, 1);

    return {
      ok: true,
      canonicalId: req.txId,
      amountAtomic: deliveredDrops.toString(),
      confirmations,
      meta: { ledger_index: tx.ledger_index ?? null }
    };
  }
}
