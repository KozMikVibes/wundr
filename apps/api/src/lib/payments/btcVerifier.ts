import type { PaymentVerifier, VerifyRequest, VerifyResult } from "./types.js";

type BtcRpcCfg = {
  url: string; // e.g. http://127.0.0.1:8332
  username: string;
  password: string;
};

type BtcRpcEnvelope<T> = {
  result: T;
  error: unknown | null;
  id?: string | number | null;
};

async function btcRpc<T>(cfg: BtcRpcCfg, method: string, params: any[]): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);

  try {
    const resp = await fetch(cfg.url, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        authorization: "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64"),
      },
      body: JSON.stringify({ jsonrpc: "1.0", id: "wundr", method, params }),
    });

    // JSON-RPC responses are JSON; if parsing fails, surface a clean error
    const json = (await resp.json().catch(() => null)) as BtcRpcEnvelope<T> | null;

    if (!resp.ok) {
      throw Object.assign(new Error("btc_rpc_http_error"), {
        status: resp.status,
        details: json,
      });
    }

    if (!json) {
      throw Object.assign(new Error("btc_rpc_parse_error"), { status: resp.status });
    }

    if (json.error) {
      throw Object.assign(new Error("btc_rpc_error"), { details: json.error });
    }

    return json.result as T;
  } finally {
    clearTimeout(t);
  }
}

type GetRawTransactionVerbose = {
  txid: string;
  confirmations?: number;
  vout: Array<{
    value: number; // BTC float (be careful); we'll convert to sats safely
    n: number;
    scriptPubKey?: {
      address?: string;
      addresses?: string[];
    };
  }>;
};

function btcToSats(valueBtc: number): bigint {
  // Convert BTC float -> sats bigint safely by stringifying
  // valueBtc in Core JSON is a decimal with up to 8 places
  const s = valueBtc.toFixed(8); // normalized string
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * 100000000n + BigInt(frac.padEnd(8, "0").slice(0, 8));
}

export class BtcVerifier implements PaymentVerifier {
  constructor(private cfg: BtcRpcCfg) {}

  async verify(
    req: VerifyRequest,
    expected: { treasury: string; minAtomic: string; minConfirmations: number }
  ): Promise<VerifyResult> {
    const treasury = expected.treasury.trim();
    const minSats = BigInt(expected.minAtomic);

    const tx = await btcRpc<GetRawTransactionVerbose>(this.cfg, "getrawtransaction", [req.txId, true]);

    const confirmations = tx.confirmations ?? 0;
    if (confirmations <= 0) return { ok: false, reason: "unconfirmed" };
    if (confirmations < expected.minConfirmations) {
      return { ok: false, reason: "insufficient_confirmations", meta: { confirmations } };
    }

    // Find outputs to treasury address
    let matchedSats = 0n;

    for (const vout of tx.vout) {
      const spk = vout.scriptPubKey;
      const addresses = spk?.addresses ?? (spk?.address ? [spk.address] : []);
      if (!addresses.length) continue;

      if (addresses.includes(treasury)) {
        matchedSats += btcToSats(vout.value);
      }
    }

    if (matchedSats < minSats) {
      return { ok: false, reason: "insufficient_value", meta: { matchedSats: matchedSats.toString() } };
    }

    return {
      ok: true,
      canonicalId: tx.txid,
      amountAtomic: matchedSats.toString(),
      confirmations,
    };
  }
}
