import { env } from "./env.js";
import { buildApp } from "./app.js";

const app = await buildApp();

app.listen({ port: env.PORT, host: "0.0.0.0" }).then((addr) => {
  console.log(`API listening on ${addr}`);
});
