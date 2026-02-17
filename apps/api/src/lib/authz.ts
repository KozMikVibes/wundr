import type { FastifyReply, FastifyRequest } from "fastify";

export class HttpError extends Error {
  statusCode: number;
  code: string;
  details?: any;

  constructor(statusCode: number, code: string, message?: string, details?: any) {
    super(message ?? code);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function fail(reply: FastifyReply, err: HttpError) {
  return reply
    .code(err.statusCode)
    .send({ error: err.code, message: err.message, details: err.details });
}

export function authUserId(req: FastifyRequest): string | undefined {
  return (req.auth as any)?.uid ?? (req.auth as any)?.userId;
}

export function hasRole(req: FastifyRequest, role: string) {
  const roles = req.auth?.roles ?? [];
  return roles.includes(role);
}

export function hasAnyRole(req: FastifyRequest, roles: string[]) {
  const owned = new Set(req.auth?.roles ?? []);
  return roles.some((r) => owned.has(r));
}

export function hasCap(req: FastifyRequest, cap: string) {
  const caps = req.auth?.caps ?? [];
  return caps.includes(cap);
}

export function hasAnyCap(req: FastifyRequest, caps: string[]) {
  const owned = new Set(req.auth?.caps ?? []);
  return caps.some((c) => owned.has(c));
}

export function requireUserId(req: FastifyRequest): string {
  const uid = authUserId(req);
  if (!uid) throw new HttpError(403, "user_required", "A user session is required for this endpoint.");
  return uid;
}

export function requireWallet(req: FastifyRequest) {
  const w = (req.auth as any)?.wallet;
  if (!w) throw new HttpError(403, "wallet_required", "A wallet session is required for this endpoint.");
  return w as { address: string; chainId: number };
}

export function requireTenantId(req: FastifyRequest): string {
  const tid = (req as any).tenant?.id ?? (req.auth as any)?.tenantId;
  if (!tid) throw new HttpError(400, "tenant_required", "x-tenant-id is required.");
  return tid;
}
