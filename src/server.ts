import "dotenv/config";
import { createServer } from "node:http";

import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  createServer(app).listen(port, () => {
    console.log(`CKMedWare backend listening on http://localhost:${port}`);
  });
}
