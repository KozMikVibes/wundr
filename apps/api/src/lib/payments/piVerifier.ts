import type { PaymentVerifier, VerifyRequest, VerifyResult } from "./types.js";

type PiCfg = {
  apiBase: string; // e.g. https://api.minepi.com (set to correct base per Pi docs)
  apiKey: string; // Pi Platform API key
};

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function piFetch(cfg: PiCfg, path: string, method: "GET" | "POST", body?: unknown): Promise<JsonObject> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);

  try {
    const resp = await fetch(`${cfg.apiBase}${path}`, {
      method,
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Key ${cfg.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const parsed = (await resp.json().catch(() => ({}))) as unknown;

    if (!resp.ok) {
      throw Object.assign(new Error("pi_api_error"), { status: resp.status, details: parsed });
    }

    return isObject(parsed) ? parsed : {};
  } finally {
    clearTimeout(t);
  }
}

export class PiVerifier implements PaymentVerifier {
  constructor(private cfg: PiCfg) {}

  async verify(
    req: VerifyRequest,
    expected: { treasury: string; minAtomic: string; minConfirmations: number }
  ): Promise<VerifyResult> {
    // req.txId is paymentId (Pi platform)
    // expected.treasury is your app’s configured receiver/identity concept (varies by Pi integration)
    const minAtomic = BigInt(expected.minAtomic);

    // 1) Read payment
    const payment = await piFetch(this.cfg, `/payments/${req.txId}`, "GET");

    // Minimal invariants, with defensive parsing:
    const status = String(payment.status ?? "").toLowerCase();
    const amount = payment.amount != null ? BigInt(String(payment.amount)) : 0n;

    if (!["approved", "completed", "complete"].includes(status)) {
      return { ok: false, reason: "payment_not_completed", meta: { status } };
    }

    if (amount < minAtomic) {
      return { ok: false, reason: "insufficient_value", meta: { amount: amount.toString() } };
    }

    // 2) Optional server-side completion handshake
    try {
      await piFetch(this.cfg, `/payments/${req.txId}/complete`, "POST", {});
    } catch {
      // If already completed, some implementations may error; treat as non-fatal
    }

    return {
      ok: true,
      canonicalId: req.txId,
      amountAtomic: amount.toString(),
      confirmations: 1,
      meta: { status },
    };
  }
}
