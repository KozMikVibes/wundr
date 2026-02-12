import { EthVerifier } from "./payments/ethVerifier.js";
import { BtcVerifier } from "./payments/btcVerifier.js";
import { XrpVerifier } from "./payments/xrpVerifier.js";
import { PiVerifier } from "./payments/piVerifier.js";
import type { PaymentVerifier, Rail } from "./payments/types.js";

export function buildVerifiersFromEnv(): Record<Rail, PaymentVerifier> {
  // ETH RPC per chain
  const rpcByChainId: Record<number, string> = {
    1: process.env.RPC_MAINNET || "",
    8453: process.env.RPC_BASE || "",
    137: process.env.RPC_POLYGON || "",
  };

  // BTC core
  const btc = new BtcVerifier({
    url: process.env.BTC_RPC_URL || "",
    username: process.env.BTC_RPC_USER || "",
    password: process.env.BTC_RPC_PASS || "",
  });

  // XRP rippled
  const xrp = new XrpVerifier({ url: process.env.XRPL_RPC_URL || "" });

  // Pi platform
  const pi = new PiVerifier({
    apiBase: process.env.PI_API_BASE || "",
    apiKey: process.env.PI_API_KEY || "",
  });

  return {
    eth: new EthVerifier({ rpcByChainId }),
    btc,
    xrp,
    pi,
  };
}
