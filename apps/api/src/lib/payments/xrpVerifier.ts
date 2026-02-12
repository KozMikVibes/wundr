import type { PaymentVerifier, VerifyRequest, VerifyResult } from "./types.js";

type XrplCfg = {
  url: string; // your rippled HTTP JSON-RPC endpoint (e.g. http://127.0.0.1:5005)
};

type XrplEnvelope<T> = {
  result?: (T & { error?: unknown; error_message?: string; error_exception?: string }) | undefined;
};

async function xrplRpc<T>(cfg: XrplCfg, method: string, params: any[]): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);

  try {
    const resp = await fetch(cfg.url, {
      method: "POST",
      signal: ac.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method, params }),
    });

    const json = (await resp.json().catch(() => null)) as XrplEnvelope<T> | null;

    if (!resp.ok) {
      throw Object.assign(new Error("xrpl_rpc_http_error"), { status: resp.status, details: json });
    }

    if (!json || !json.result) {
      throw Object.assign(new Error("xrpl_rpc_parse_error"), { status: resp.status, details: json });
    }

    if ((json.result as any).error) {
      throw Object.assign(new Error("xrpl_rpc_error"), { details: json.result });
    }

    return json.result as T;
  } finally {
    clearTimeout(t);
  }
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

// For optional depth check when minConfirmations > 1
type LedgerCurrentResult = {
  ledger_current_index?: number;
};

export class XrpVerifier implements PaymentVerifier {
  constructor(private cfg: XrplCfg) {}

  async verify(
    req: VerifyRequest,
    expected: { treasury: string; minAtomic: string; minConfirmations: number }
  ): Promise<VerifyResult> {
    const treasury = expected.treasury.trim();
    const minDrops = BigInt(expected.minAtomic);

    // rippled tx lookup
    const tx = await xrplRpc<TxResult>(this.cfg, "tx", [{ transaction: req.txId, binary: false }]);

    if (!tx.validated) return { ok: false, reason: "not_validated" };
    if (tx.TransactionType !== "Payment") return { ok: false, reason: "not_payment" };
    if ((tx.Destination ?? "") !== treasury) return { ok: false, reason: "treasury_mismatch" };

    const delivered = tx.meta?.delivered_amount;
    if (!delivered || typeof delivered !== "string") {
      // we only accept XRP payments here (drops as string); IOUs would be object
      return { ok: false, reason: "missing_or_non_xrp_delivered_amount" };
    }

    const deliveredDrops = BigInt(delivered);
    if (deliveredDrops < minDrops) {
      return { ok: false, reason: "insufficient_value", meta: { deliveredDrops: deliveredDrops.toString() } };
    }

    // XRPL "confirmed" is effectively "validated", but if a caller asks for more than 1 confirmation,
    // we can approximate "depth" using current validated ledger index.
    let confirmations = 1;

    if (expected.minConfirmations > 1 && tx.ledger_index != null) {
      try {
        const cur = await xrplRpc<LedgerCurrentResult>(this.cfg, "ledger_current", [{}]);
        const currentIndex = cur.ledger_current_index;

        if (typeof currentIndex === "number") {
          confirmations = Math.max(1, currentIndex - tx.ledger_index + 1);
          if (confirmations < expected.minConfirmations) {
            return {
              ok: false,
              reason: "insufficient_confirmations",
              meta: { confirmations, ledger_index: tx.ledger_index, ledger_current_index: currentIndex },
            };
          }
        } else {
          // If we can't compute depth, fall back to validated=1
          confirmations = 1;
        }
      } catch {
        confirmations = 1;
      }
    }

    return {
      ok: true,
      canonicalId: req.txId,
      amountAtomic: deliveredDrops.toString(),
      confirmations: Math.max(confirmations, 1),
      meta: { ledger_index: tx.ledger_index ?? null },
    };
  }
}
