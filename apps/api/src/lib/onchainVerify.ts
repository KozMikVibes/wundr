import { createPublicClient, http, parseAbiItem, parseEventLogs, type Address } from "viem";
import { mainnet, base, polygon } from "viem/chains";

export type SupportedChainId = 1 | 8453 | 137;

const chainMap: Record<SupportedChainId, any> = {
  1: mainnet,
  8453: base,
  137: polygon,
};

// You will likely set these via env per chain later.
export type PaymentConfig = {
  chainId: SupportedChainId;
  rpcUrl: string;
  treasury: Address;

  // For ERC20 payments:
  tokenAddress?: Address; // e.g. USDC
  tokenDecimals?: number; // USDC = 6
};

export function makeClient(chainId: SupportedChainId, rpcUrl: string) {
  return createPublicClient({
    chain: chainMap[chainId],
    transport: http(rpcUrl),
  });
}

// Native payment verification
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

  // NOTE: Receipt doesn't include value. We need transaction details for value.
  const tx = await params.client.getTransaction({ hash: params.txHash });

  if ((tx.from as string).toLowerCase() !== params.buyer.toLowerCase())
    return { ok: false as const, reason: "buyer_mismatch" };

  if ((tx.to as string | null)?.toLowerCase() !== params.treasury.toLowerCase())
    return { ok: false as const, reason: "treasury_mismatch" };

  if ((tx.value ?? 0n) < params.minWei) return { ok: false as const, reason: "insufficient_value" };

  return { ok: true as const, receipt, tx };
}

// ERC20 Transfer verification
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

  // Decode logs and look for a qualifying Transfer
  const logs = parseEventLogs({
    abi: [transferEvent],
    logs: receipt.logs,
    eventName: "Transfer",
  });

  const found = logs.some((l) => {
    // Only accept logs emitted by the token contract
    if ((l.address as string).toLowerCase() !== params.token.toLowerCase()) return false;

    const from = (l.args as any).from as string;
    const to = (l.args as any).to as string;
    const value = (l.args as any).value as bigint;

    return (
      from.toLowerCase() === params.buyer.toLowerCase() &&
      to.toLowerCase() === params.treasury.toLowerCase() &&
      value >= params.minTokenAmount
    );
  });

  export type SupportedEvmChainId = 1 | 8453 | 137;

const chainMap: Record<SupportedEvmChainId, any> = {
  1: mainnet,
  8453: base,
  137: polygon
};

export function makeEvmClient(chainId: SupportedEvmChainId, rpcUrl: string) {
  return createPublicClient({ chain: chainMap[chainId], transport: http(rpcUrl) });
}

export async function verifyNativeEthPayment(params: {
  client: ReturnType<typeof makeEvmClient>;
  txHash: `0x${string}`;
  buyer: Address;
  treasury: Address;
  minWei: bigint;
  minConfirmations: bigint; // e.g. 2n or 6n
}) {
  const receipt = await params.client.getTransactionReceipt({ hash: params.txHash });

  if (receipt.status !== "success") return { ok: false as const, reason: "tx_failed" };
  if (receipt.blockNumber == null) return { ok: false as const, reason: "missing_blockNumber" };

  const confirmations = await params.client.getTransactionConfirmations({
    transactionReceipt: receipt
  });

  if (confirmations < params.minConfirmations) {
    return { ok: false as const, reason: "insufficient_confirmations", confirmations };
  }

  const tx = await params.client.getTransaction({ hash: params.txHash });

  if ((tx.from as string).toLowerCase() !== params.buyer.toLowerCase())
    return { ok: false as const, reason: "buyer_mismatch" };

  if (!tx.to) return { ok: false as const, reason: "tx_to_missing" };
  if ((tx.to as string).toLowerCase() !== params.treasury.toLowerCase())
    return { ok: false as const, reason: "treasury_mismatch" };

  if ((tx.value ?? 0n) < params.minWei) return { ok: false as const, reason: "insufficient_value" };

  return { ok: true as const, receipt, tx, confirmations };
}


  if (!found) return { ok: false as const, reason: "no_matching_transfer" };

  return { ok: true as const, receipt };
}
