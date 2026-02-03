import { createPublicClient, http, type Address } from "viem";
import { mainnet, base, polygon } from "viem/chains";
import type { PaymentVerifier, VerifyRequest, VerifyResult } from "./types.js";

type SupportedEvmChainId = 1 | 8453 | 137;

const chainMap: Record<SupportedEvmChainId, any> = {
  1: mainnet,
  8453: base,
  137: polygon
};

function isSupportedEvmChainId(x: number): x is SupportedEvmChainId {
  return x === 1 || x === 8453 || x === 137;
}

export class EthVerifier implements PaymentVerifier {
  constructor(private cfg: { rpcByChainId: Record<number, string> }) {}

  async verify(req: VerifyRequest, expected: { treasury: string; minAtomic: string; minConfirmations: number }): Promise<VerifyResult> {
    if (!req.chainId || !isSupportedEvmChainId(req.chainId)) {
      return { ok: false, reason: "unsupported_chain" };
    }

    const rpcUrl = this.cfg.rpcByChainId[req.chainId];
    if (!rpcUrl) return { ok: false, reason: "rpc_not_configured" };

    const client = createPublicClient({
      chain: chainMap[req.chainId],
      transport: http(rpcUrl)
    });

    const txHash = req.txId as `0x${string}`;
    const buyer = req.buyerAddress.toLowerCase() as Address;
    const treasury = expected.treasury.toLowerCase() as Address;

    const receipt = await client.getTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") return { ok: false, reason: "tx_failed" };

    // Require blockNumber
    if (receipt.blockNumber == null) return { ok: false, reason: "missing_blockNumber" };

    // Confirmations (requires blockNumber) :contentReference[oaicite:4]{index=4}
    const confirmationsBig = await client.getTransactionConfirmations({ transactionReceipt: receipt });
    const confirmations = Number(confirmationsBig);

    if (confirmations < expected.minConfirmations) {
      return { ok: false, reason: "insufficient_confirmations", meta: { confirmations } };
    }

    const tx = await client.getTransaction({ hash: txHash });

    if ((tx.from as string).toLowerCase() !== buyer) return { ok: false, reason: "buyer_mismatch" };
    if (!tx.to) return { ok: false, reason: "missing_to" };
    if ((tx.to as string).toLowerCase() !== treasury) return { ok: false, reason: "treasury_mismatch" };

    const minWei = BigInt(expected.minAtomic);
    const value = tx.value ?? 0n;

    if (value < minWei) return { ok: false, reason: "insufficient_value" };

    return {
      ok: true,
      canonicalId: txHash.toLowerCase(),
      amountAtomic: value.toString(),
      confirmations,
      meta: { chainId: req.chainId, blockNumber: receipt.blockNumber.toString() }
    };
  }
}
