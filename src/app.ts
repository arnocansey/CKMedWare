import cors from "cors";
import express from "express";

import { store } from "./data/store.js";
import type {
  DistributionCreateRequest,
  LoginRequest,
  User,
} from "./types.js";

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === "/health" || req.path === "/api/auth/login") {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  store
    .getUserForToken(token)
    .then((user) => {
      if (!user) {
        res.status(401).json({ message: "Session expired or invalid" });
        return;
      }

      res.locals.user = user;
      next();
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Authentication failed";
      res.status(500).json({ message });
    });
}

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(authMiddleware);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ckmedware-backend" });
  });

  app.post("/api/auth/login", async (req, res) => {
    const body = req.body as Partial<LoginRequest> | undefined;
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password ?? "";

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const response = await store.authenticate(email, password);

    if (!response) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    res.json(response);
  });

  app.get("/api/dashboard", async (_req, res) => {
    const user = res.locals.user as User;
    res.json(await store.getDashboard(user));
  });

  app.get("/api/orders", async (_req, res) => {
    res.json(await store.getOrders());
  });

  app.get("/api/deliveries", async (_req, res) => {
    res.json(await store.getDeliveries());
  });

  app.get("/api/reports", async (_req, res) => {
    res.json(await store.getReports());
  });

  app.get("/api/distributions/new", async (_req, res) => {
    res.json(await store.getDistributionDraft());
  });

  app.post("/api/distributions", async (req, res) => {
    const body = req.body as Partial<DistributionCreateRequest> | undefined;
    const response = await store.createDistribution({
      outletId: body?.outletId ?? null,
      outletName: body?.outletName ?? "",
      vehicleId: body?.vehicleId ?? null,
      vehicleName: body?.vehicleName ?? "",
      dateValue: body?.dateValue ?? "",
      products: body?.products ?? [],
    });

    res.status(201).json(response);
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({ message });
  });

  return app;
}
