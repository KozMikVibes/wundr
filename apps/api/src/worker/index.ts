import { loadEnv } from "../lib/env.js";
import { startPurchaseFinalizerWorker } from "./purchaseFinalizer.js";

loadEnv();
startPurchaseFinalizerWorker();
console.log("purchase finalizer worker started");
