import "dotenv/config";
import { createServer } from "node:http";

import { createApp } from "./app.js";
import { store } from "./data/store.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();
const expiryCleanupIntervalMs = 6 * 60 * 60 * 1000;

async function cleanupExpiredInventory() {
  try {
    await store.cleanupExpiredInventory();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expired inventory cleanup failed";
    console.error(message);
  }
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  createServer(app).listen(port, () => {
    console.log(`CKMedWare backend listening on http://localhost:${port}`);
  });

  cleanupExpiredInventory();
  const expiryCleanupInterval = setInterval(cleanupExpiredInventory, expiryCleanupIntervalMs);
  expiryCleanupInterval.unref?.();
}
