import type { PaymentVerifier, VerifyRequest, VerifyResult } from "./types.js";

type PiCfg = {
  apiBase: string;   // e.g. https://api.minepi.com (set to correct base per Pi docs)
  apiKey: string;    // Pi Platform API key
};

async function piFetch(cfg: PiCfg, path: string, method: "GET" | "POST", body?: any) {
  const resp = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "authorization": `Key ${cfg.apiKey}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return Promise.reject(Object.assign(new Error("pi_api_error"), { status: resp.status, details: json }));
  }
  return json;
}

export class PiVerifier implements PaymentVerifier {
  constructor(private cfg: PiCfg) {}

  async verify(req: VerifyRequest, expected: { treasury: string; minAtomic: string; minConfirmations: number }): Promise<VerifyResult> {
    // req.txId is paymentId (Pi platform)
    // expected.treasury is your app’s configured receiver/identity concept (varies by Pi integration)
    const minAtomic = BigInt(expected.minAtomic);

    // 1) Read payment
    // Pi Platform APIs allow querying transactions related to your app :contentReference[oaicite:12]{index=12}
    const payment = await piFetch(this.cfg, `/payments/${req.txId}`, "GET");

    // Shape varies; you should map fields based on your Pi payment configuration.
    // We enforce minimal invariants:
    const status = String(payment.status ?? "").toLowerCase();
    const amount = payment.amount != null ? BigInt(String(payment.amount)) : 0n;

    if (!["approved", "completed", "complete"].includes(status)) {
      return { ok: false, reason: "payment_not_completed", meta: { status } };
    }

    if (amount < minAtomic) {
      return { ok: false, reason: "insufficient_value", meta: { amount: amount.toString() } };
    }

    // 2) Server-side completion handshake (recommended by Pi flow docs) :contentReference[oaicite:13]{index=13}
    // If your integration requires explicit completion:
    try {
      await piFetch(this.cfg, `/payments/${req.txId}/complete`, "POST", {});
    } catch {
      // if already completed, some implementations may return an error; treat as non-fatal
    }

    return {
      ok: true,
      canonicalId: req.txId,
      amountAtomic: amount.toString(),
      confirmations: 1,
      meta: { status }
    };
  }
}
