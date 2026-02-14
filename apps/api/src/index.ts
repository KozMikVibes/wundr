import { loadEnv } from "./lib/env.js";
import { buildApp } from "./app.js";

const env = loadEnv();

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`API listening on :${env.PORT}`);
} catch (err: any) {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
}
