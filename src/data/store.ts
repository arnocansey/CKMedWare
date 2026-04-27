import type { DataStore } from "./data-store.js";
import { FileStore } from "./file-store.js";
import { PrismaStore } from "./prisma-store.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

export const store: DataStore = hasDatabaseUrl ? new PrismaStore() : new FileStore();
