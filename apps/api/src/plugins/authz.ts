import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  HttpError,
  fail,
  hasRole,
  hasAnyRole,
  hasCap,
  hasAnyCap,
  requireUserId,
  requireWallet,
} from "../lib/authz.js";

declare module "fastify" {
  interface FastifyInstance {
    requireRole: (role: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAnyRole: (roles: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireCap: (cap: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAnyCap: (caps: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireWallet: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authzPlugin = fp(async (app) => {
  app.decorate("requireRole", (role: string) => {
    return async (req, reply) => {
      try {
        if (!hasRole(req, role)) throw new HttpError(403, "forbidden", `Missing role: ${role}`);
      } catch (e: any) {
        return fail(reply, e instanceof HttpError ? e : new HttpError(500, "authz_error"));
      }
    };
  });

  app.decorate("requireAnyRole", (roles: string[]) => {
    return async (req, reply) => {
      try {
        if (!hasAnyRole(req, roles)) throw new HttpError(403, "forbidden", `Missing any role: ${roles.join(",")}`);
      } catch (e: any) {
        return fail(reply, e instanceof HttpError ? e : new HttpError(500, "authz_error"));
      }
    };
  });

  app.decorate("requireCap", (cap: string) => {
    return async (req, reply) => {
      try {
        if (!hasCap(req, cap)) throw new HttpError(403, "forbidden", `Missing capability: ${cap}`);
      } catch (e: any) {
        return fail(reply, e instanceof HttpError ? e : new HttpError(500, "authz_error"));
      }
    };
  });

  app.decorate("requireAnyCap", (caps: string[]) => {
    return async (req, reply) => {
      try {
        if (!hasAnyCap(req, caps)) throw new HttpError(403, "forbidden", `Missing any capability: ${caps.join(",")}`);
      } catch (e: any) {
        return fail(reply, e instanceof HttpError ? e : new HttpError(500, "authz_error"));
      }
    };
  });

  app.decorate("requireUser", async (req, reply) => {
    try {
      requireUserId(req);
    } catch (e: any) {
      return fail(reply, e instanceof HttpError ? e : new HttpError(500, "authz_error"));
    }
  });

  app.decorate("requireWallet", async (req, reply) => {
    try {
      requireWallet(req);
    } catch (e: any) {
      return fail(reply, e instanceof HttpError ? e : new HttpError(500, "authz_error"));
    }
  });
});
