import { Router } from "express";

let counters: Record<string, number> = {
  http_requests_total: 0,
  purchase_verify_total: 0,
  purchase_verify_failed_total: 0,
  purchase_verify_completed_total: 0,
  purchase_verify_pending_total: 0
};

export function inc(name: keyof typeof counters, delta = 1) {
  counters[name] = (counters[name] ?? 0) + delta;
}

export function metricsRouter() {
  const r = Router();
  r.get("/", (_req, res) => {
    res.type("text/plain");
    const lines = Object.entries(counters).map(([k, v]) => `${k} ${v}`);
    res.send(lines.join("\n") + "\n");
  });
  return r;
}
