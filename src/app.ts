import cors from "cors";
import express from "express";

import { store } from "./data/store.js";
import type {
  BranchUpdateRequest,
  DistributionCreateRequest,
  InventoryCreateRequest,
  InventoryUpdateRequest,
  LoginRequest,
  PurchaseOrderCreateRequest,
  SetupOutletRequest,
  SetupProductRequest,
  SetupVehicleRequest,
  SignupRequest,
  User,
} from "./types.js";

type AsyncRouteHandler = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<unknown> | unknown;

function asyncHandler(handler: AsyncRouteHandler) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function getRouteParam(params: express.Request["params"], key: string) {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === "/health" || req.path === "/api/auth/login" || req.path === "/api/auth/signup") {
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

  app.post(
    "/api/auth/login",
    asyncHandler(async (req, res) => {
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
    }),
  );

  app.post("/api/auth/signup", asyncHandler(async (req, res) => {
    const body = req.body as Partial<SignupRequest> | undefined;

    const response = await store.signup({
      name: body?.name ?? "",
      email: body?.email ?? "",
      password: body?.password ?? "",
    });

    res.status(201).json(response);
  }));

  app.get("/api/dashboard", asyncHandler(async (_req, res) => {
    const user = res.locals.user as User;
    res.json(await store.getDashboard(user));
  }));

  app.get("/api/orders", asyncHandler(async (_req, res) => {
    res.json(await store.getOrders());
  }));

  app.get("/api/purchase-orders", asyncHandler(async (_req, res) => {
    res.json(await store.getPurchaseOrders());
  }));

  app.post("/api/purchase-orders", asyncHandler(async (req, res) => {
    const body = req.body as Partial<PurchaseOrderCreateRequest> | undefined;

    const response = await store.createPurchaseOrder({
      supplierName: body?.supplierName ?? "",
      items: body?.items ?? [],
    });

    res.status(201).json(response);
  }));

  app.post("/api/purchase-orders/:id/receive", asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params, "id");
    if (!id) {
      res.status(400).json({ message: "Missing purchase order id" });
      return;
    }

    const response = await store.receivePurchaseOrder(id);
    res.json(response);
  }));

  app.get("/api/deliveries", asyncHandler(async (_req, res) => {
    res.json(await store.getDeliveries());
  }));

  app.get("/api/reports", asyncHandler(async (_req, res) => {
    res.json(await store.getReports());
  }));

  app.get("/api/inventory", asyncHandler(async (_req, res) => {
    res.json(await store.getInventory());
  }));

  app.get("/api/branches", asyncHandler(async (_req, res) => {
    res.json(await store.listBranches());
  }));

  app.post("/api/branches", asyncHandler(async (req, res) => {
    const body = req.body as Partial<SetupOutletRequest> | undefined;

    const response = await store.createOutlet({
      name: body?.name ?? "",
      area: body?.area ?? "",
    });

    res.status(201).json({ ...response, isActive: true });
  }));

  app.patch("/api/branches/:id", asyncHandler(async (req, res) => {
    const body = req.body as Partial<BranchUpdateRequest> | undefined;
    const id = getRouteParam(req.params, "id");
    if (!id) {
      res.status(400).json({ message: "Missing branch id" });
      return;
    }

    const response = await store.updateBranch(id, {
      name: body?.name,
      area: body?.area,
      isActive: body?.isActive,
    });

    res.json(response);
  }));

  app.post("/api/inventory", asyncHandler(async (req, res) => {
    const body = req.body as Partial<InventoryCreateRequest> | undefined;

    const response = await store.createInventoryItem({
      drugName: body?.drugName ?? "",
      quantity: Number(body?.quantity ?? 0),
      expiryDate: body?.expiryDate ?? "",
      costPrice: Number(body?.costPrice ?? 0),
      category: body?.category,
      kind: body?.kind,
    });

    res.status(201).json(response);
  }));

  app.patch("/api/inventory/:id", asyncHandler(async (req, res) => {
    const body = req.body as Partial<InventoryUpdateRequest> | undefined;
    const id = getRouteParam(req.params, "id");
    if (!id) {
      res.status(400).json({ message: "Missing inventory id" });
      return;
    }

    const response = await store.updateInventoryItem(id, {
      quantity: body?.quantity,
      expiryDate: body?.expiryDate,
      costPrice: body?.costPrice,
    });

    res.json(response);
  }));

  app.delete("/api/inventory/:id", asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params, "id");
    if (!id) {
      res.status(400).json({ message: "Missing inventory id" });
      return;
    }

    await store.deleteInventoryItem(id);
    res.status(204).send();
  }));

  app.get("/api/distributions/new", asyncHandler(async (_req, res) => {
    res.json(await store.getDistributionDraft());
  }));

  app.post("/api/distributions", asyncHandler(async (req, res) => {
    const body = req.body as Partial<DistributionCreateRequest> | undefined;
    const response = await store.createDistribution({
      outletId: body?.outletId ?? null,
      outletName: body?.outletName ?? "",
      vehicleId: body?.vehicleId ?? null,
      vehicleName: body?.vehicleName ?? "",
      dateValue: body?.dateValue ?? "",
      signature: body?.signature ?? "",
      products: body?.products ?? [],
    });

    res.status(201).json(response);
  }));

  app.post("/api/setup/outlets", asyncHandler(async (req, res) => {
    const body = req.body as Partial<SetupOutletRequest> | undefined;

    const response = await store.createOutlet({
      name: body?.name ?? "",
      area: body?.area ?? "",
    });

    res.status(201).json(response);
  }));

  app.post("/api/setup/vehicles", asyncHandler(async (req, res) => {
    const body = req.body as Partial<SetupVehicleRequest> | undefined;

    const response = await store.createVehicle({
      name: body?.name ?? "",
      registrationNumber: body?.registrationNumber ?? "",
      driverName: body?.driverName ?? "",
      defaultDeliveryFee: Number(body?.defaultDeliveryFee ?? 0),
    });

    res.status(201).json(response);
  }));

  app.post("/api/setup/products", asyncHandler(async (req, res) => {
    const body = req.body as Partial<SetupProductRequest> | undefined;

    const response = await store.createProduct({
      name: body?.name ?? "",
      category: body?.category ?? "",
      kind: body?.kind ?? "pill",
      price: Number(body?.price ?? 0),
    });

    res.status(201).json(response);
  }));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({ message });
  });

  return app;
}
