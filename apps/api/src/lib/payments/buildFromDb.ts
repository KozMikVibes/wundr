import { EthVerifier } from "./ethVerifier.js";
import { BtcVerifier } from "./btcVerifier.js";
import { XrpVerifier } from "./xrpVerifier.js";
import { PiVerifier } from "./piVerifier.js";
import type { Rail, PaymentVerifier } from "./types.js";
import type { PaymentRailRow } from "../../repos/paymentRailsRepo.js";

export function buildVerifierForRail(row: PaymentRailRow): PaymentVerifier {
  // All verifiers are constructed using metadata/rpcUrl from DB row.
  // We also allow secrets (auth keys) from env because you should not store private keys in DB.

  if (row.rail === "eth") {
    // eth verifier expects rpcByChainId map
    const rpcByChainId: Record<number, string> = {};
    if (row.chain_id != null && row.rpc_url) rpcByChainId[row.chain_id] = row.rpc_url;
    return new EthVerifier({ rpcByChainId });
  }

  if (row.rail === "btc") {
    // Bitcoin Core RPC creds should come from env; URL can come from DB or env.
    return new BtcVerifier({
      url: row.rpc_url || process.env.BTC_RPC_URL || "",
      username: process.env.BTC_RPC_USER || "",
      password: process.env.BTC_RPC_PASS || ""
    });
  }

  if (row.rail === "xrp") {
    return new XrpVerifier({ url: row.rpc_url || process.env.XRPL_RPC_URL || "" });
  }

  if (row.rail === "pi") {
    return new PiVerifier({
      apiBase: process.env.PI_API_BASE || "",
      apiKey: process.env.PI_API_KEY || ""
    });
  }

  throw new Error("unknown_rail");
}

export function railKey(rail: Rail, chainId: number | null) {
  return `${rail}:${chainId ?? "null"}`;
}
