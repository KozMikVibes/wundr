import {
  createPublicClient,
  http,
  parseAbiItem,
  parseEventLogs,
  type Address,
  type Chain,
} from "viem";
import { mainnet, base, polygon } from "viem/chains";

export type SupportedChainId = 1 | 8453 | 137;

const chainMap: Record<SupportedChainId, Chain> = {
  1: mainnet,
  8453: base,
  137: polygon,
};

export function makeClient(chainId: SupportedChainId, rpcUrl: string) {
  return createPublicClient({
    chain: chainMap[chainId],
    transport: http(rpcUrl),
  });
}

/** Native ETH payment verification */
export async function verifyNativePayment(params: {
  client: ReturnType<typeof makeClient>;
  txHash: `0x${string}`;
  buyer: Address;
  treasury: Address;
  minWei: bigint;
}) {
  const receipt = await params.client.getTransactionReceipt({ hash: params.txHash });

  if (receipt.status !== "success") return { ok: false as const, reason: "tx_failed" };
  if (!receipt.to) return { ok: false as const, reason: "tx_to_missing" };

  const tx = await params.client.getTransaction({ hash: params.txHash });

  if ((tx.from as string).toLowerCase() !== params.buyer.toLowerCase()) {
    return { ok: false as const, reason: "buyer_mismatch" };
  }

  if (!tx.to) return { ok: false as const, reason: "tx_to_missing" };
  if ((tx.to as string).toLowerCase() !== params.treasury.toLowerCase()) {
    return { ok: false as const, reason: "treasury_mismatch" };
  }

  if ((tx.value ?? 0n) < params.minWei) {
    return { ok: false as const, reason: "insufficient_value" };
  }

  return { ok: true as const, receipt, tx };
}

/** ERC20 Transfer verification */
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export async function verifyErc20Payment(params: {
  client: ReturnType<typeof makeClient>;
  txHash: `0x${string}`;
  buyer: Address;
  treasury: Address;
  token: Address;
  minTokenAmount: bigint;
}) {
  const receipt = await params.client.getTransactionReceipt({ hash: params.txHash });
  if (receipt.status !== "success") return { ok: false as const, reason: "tx_failed" };

  const logs = parseEventLogs({
    abi: [transferEvent],
    logs: receipt.logs,
    eventName: "Transfer",
  });

  const found = logs.some((l) => {
    if ((l.address as string).toLowerCase() !== params.token.toLowerCase()) return false;

    const args = l.args as unknown as { from: Address; to: Address; value: bigint };
    return (
      args.from.toLowerCase() === params.buyer.toLowerCase() &&
      args.to.toLowerCase() === params.treasury.toLowerCase() &&
      args.value >= params.minTokenAmount
    );
  });

  if (!found) return { ok: false as const, reason: "no_matching_transfer" };
  return { ok: true as const, receipt };
}
