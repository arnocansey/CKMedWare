import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createSeedDatabase } from "./seed.js";
import type { DataStore } from "./data-store.js";
import type {
  Branch,
  BranchListResponse,
  BranchUpdateRequest,
  DashboardResponse,
  DeliveryStop,
  DeliveriesResponse,
  DistributionCreateRequest,
  DistributionCreateResponse,
  DistributionDraftResponse,
  InventoryCreateRequest,
  InventoryUpdateRequest,
  InventoryItem,
  InventoryResponse,
  LoginResponse,
  OrdersResponse,
  PurchaseOrder,
  PurchaseOrderCreateRequest,
  PurchaseOrdersResponse,
  PersistedDatabase,
  ProductKind,
  ReportsResponse,
  SetupOutletRequest,
  SetupOutletResponse,
  SetupProductRequest,
  SetupProductResponse,
  SetupVehicleRequest,
  SetupVehicleResponse,
  SignupRequest,
  SubmittedDistributionRecord,
  User,
} from "../types.js";

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

function createToken() {
  return `ckm_${randomUUID().replaceAll("-", "")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getSessionTtlMs() {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 30);
  if (!Number.isFinite(days) || days <= 0) {
    return 30 * 86400000;
  }
  return Math.floor(days * 86400000);
}

function formatCurrency(value: number) {
  return `GHS ${value.toLocaleString()}`;
}

function formatCreatedTime() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return `Today - ${hours}:${minutes}`;
}

function createOrderId(existingCount: number) {
  return `ORD-${(2500 + existingCount + 1).toString()}`;
}

function createDistributionId() {
  return `DST-${Date.now().toString().slice(-6)}`;
}

function createBatchNumber() {
  return `BATCH-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function colorForProduct(kind: ProductKind) {
  switch (kind) {
    case "pill":
      return "#0F3D1F";
    case "liquid":
      return "#E89B2A";
    case "syringe":
      return "#2A6FE8";
    case "tablets":
      return "#1D8A78";
    default:
      return "#0F3D1F";
  }
}

function formatScheduleEta(dateValue: string) {
  if (!dateValue) {
    return "Schedule pending";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Schedule pending";
  }

  return `Scheduled ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseExpiryDate(value: string) {
  const expiryDate = new Date(`${value}T00:00:00`);

  if (!value || Number.isNaN(expiryDate.getTime())) {
    throw new Error("Enter a valid expiry date.");
  }

  return expiryDate;
}

export class FileStore implements DataStore {
  private readonly filePath: string;

  constructor() {
    const configuredDataDir = process.env.DATA_DIR?.trim();
    const dataDir = configuredDataDir
      ? path.resolve(configuredDataDir)
      : path.resolve(process.cwd(), "data");
    this.filePath = path.join(dataDir, "store.json");

    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    if (!existsSync(this.filePath)) {
      this.writeDatabase(createSeedDatabase());
    }
  }

  private readDatabase() {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedDatabase;
  }

  private writeDatabase(database: PersistedDatabase) {
    writeFileSync(this.filePath, JSON.stringify(database, null, 2));
  }

  async authenticate(email: string, password: string) {
    const database = this.readDatabase();
    const user = database.users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());

    if (!user || user.passwordHash !== hashPassword(password)) {
      return null;
    }

    const token = createToken();
    database.sessions = database.sessions
      .filter((entry) => entry.userId !== user.id)
      .concat({
        token,
        userId: user.id,
        createdAt: nowIso(),
      });
    this.writeDatabase(database);

    const result: LoginResponse = {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };

    return result;
  }

  async signup(input: SignupRequest) {
    const database = this.readDatabase();
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();

    if (!name || !email || !password) {
      throw new Error("Name, email, and password are required.");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }

    const existing = database.users.find((entry) => entry.email.toLowerCase() === email);

    if (existing) {
      throw new Error("An account already exists for this email.");
    }

    const user = {
      id: `usr_${randomUUID()}`,
      name,
      email,
      role: database.users.length === 0 ? "admin" as const : "dispatcher" as const,
      passwordHash: hashPassword(password),
    };
    const token = createToken();

    database.users.push(user);
    database.sessions = database.sessions
      .filter((entry) => entry.userId !== user.id)
      .concat({
        token,
        userId: user.id,
        createdAt: nowIso(),
      });
    this.writeDatabase(database);

    const result: LoginResponse = {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };

    return result;
  }

  async refreshSession(token: string): Promise<LoginResponse | null> {
    const database = this.readDatabase();
    const session = database.sessions.find((entry) => entry.token === token);

    if (!session) {
      return null;
    }

    const user = database.users.find((entry) => entry.id === session.userId);
    if (!user) {
      return null;
    }

    const nextToken = createToken();
    database.sessions = database.sessions
      .filter((entry) => entry.token !== token)
      .concat({
        token: nextToken,
        userId: user.id,
        createdAt: nowIso(),
      });
    this.writeDatabase(database);

    return {
      token: nextToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async revokeSession(token: string): Promise<void> {
    const database = this.readDatabase();
    database.sessions = database.sessions.filter((entry) => entry.token !== token);
    this.writeDatabase(database);
  }

  async getUserForToken(token: string) {
    const database = this.readDatabase();
    const now = Date.now();
    const ttlMs = getSessionTtlMs();
    database.sessions = database.sessions.filter((entry) => {
      const createdAt = new Date(entry.createdAt).getTime();
      return Number.isFinite(createdAt) && now - createdAt <= ttlMs;
    });
    const session = database.sessions.find((entry) => entry.token === token);

    this.writeDatabase(database);

    if (!session) {
      return null;
    }

    const user = database.users.find((entry) => entry.id === session.userId);

    if (!user) {
      return null;
    }

    const result: User = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return result;
  }

  async getDashboard(user: User): Promise<DashboardResponse> {
    const database = this.readDatabase();

    return {
      ...database.dashboard,
      areaBreakdown: database.dashboard.areaBreakdown ?? [],
      user,
    };
  }

  async getOrders(): Promise<OrdersResponse> {
    const database = this.readDatabase();
    const submittedByOrder = new Map(database.submittedDistributions.map((record) => [record.distributionId, record]));

    return {
      filters: database.orders.filters,
      orders: database.orders.orders.map((order) => {
        const numericAmount = Number(order.amount.replace(/[^0-9.]/g, "").replace(/,/g, ""));
        const submitted = submittedByOrder.get(order.id);

        return {
          ...order,
          lineItems:
            order.lineItems ??
            submitted?.products.map((product) => ({
              drugName: product.name,
              quantity: product.quantity,
              expiryDate: product.expiryDate ?? submitted.dateValue,
              costPrice: product.price,
              batchNumber: product.batchNumber ?? "N/A",
            })) ??
            [],
          signature: order.signature ?? submitted?.signature ?? null,
          amountValue: order.amountValue ?? (Number.isFinite(numericAmount) ? numericAmount : 0),
          date: order.date ?? submitted?.createdAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        };
      }),
    };
  }

  async getPurchaseOrders(_options?: { q?: string; page?: number; limit?: number }): Promise<PurchaseOrdersResponse> {
    throw new Error("Purchase orders require a PostgreSQL database. Configure DATABASE_URL and redeploy.");
  }

  async createPurchaseOrder(_input: PurchaseOrderCreateRequest): Promise<PurchaseOrder> {
    throw new Error("Purchase orders require a PostgreSQL database. Configure DATABASE_URL and redeploy.");
  }

  async receivePurchaseOrder(_id: string): Promise<PurchaseOrder> {
    throw new Error("Purchase orders require a PostgreSQL database. Configure DATABASE_URL and redeploy.");
  }

  async getDeliveries(): Promise<DeliveriesResponse> {
    const database = this.readDatabase();
    const records = database.submittedDistributions ?? [];

    if (records.length === 0) {
      return {
        routeId: database.deliveries.routeId,
        totalUnits: 0,
        activeStop: null,
        stops: [],
      };
    }

    const stops: DeliveryStop[] = records
      .slice(0, 50)
      .map((record, index) => {
        const date = new Date(record.dateValue ? `${record.dateValue}T09:00:00` : record.createdAt);
        const time = Number.isNaN(date.getTime())
          ? "--:--"
          : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const status: DeliveryStop["status"] = index === 0 ? "active" : "next";

        return {
          stopId: record.distributionId,
          id: index + 1,
          time,
          outlet: record.outletName,
          area: "Distribution area",
          outletPhone: record.outletPhone ?? database.distributionDraft.outletPhone ?? null,
          units: record.units,
          status: record.deliveryStatus ?? status,
          eta: record.eta || "Scheduled",
        };
      });

    return {
      routeId: records[0]?.vehicleName ?? database.deliveries.routeId,
      totalUnits: stops.reduce((sum, stop) => sum + stop.units, 0),
      activeStop: stops[0] ?? null,
      stops,
    };
  }

  async startDeliveryStop(id: string): Promise<DeliveriesResponse> {
    const database = this.readDatabase();
    const index = database.submittedDistributions.findIndex((record) => record.distributionId === id);
    if (index < 0) {
      throw new Error("Delivery stop not found.");
    }

    database.submittedDistributions = database.submittedDistributions.map((record, currentIndex) => ({
      ...record,
      deliveryStatus:
        currentIndex === index
          ? "active"
          : (record.deliveryStatus ?? "next") === "active"
            ? "next"
            : (record.deliveryStatus ?? "next"),
    }));
    this.writeDatabase(database);
    return this.getDeliveries();
  }

  async completeDeliveryStop(id: string): Promise<DeliveriesResponse> {
    const database = this.readDatabase();
    const index = database.submittedDistributions.findIndex((record) => record.distributionId === id);
    if (index < 0) {
      throw new Error("Delivery stop not found.");
    }

    database.submittedDistributions[index] = {
      ...database.submittedDistributions[index],
      deliveryStatus: "done",
    };

    const nextIndex = database.submittedDistributions.findIndex(
      (record, currentIndex) => currentIndex !== index && (record.deliveryStatus ?? "next") === "next",
    );
    if (nextIndex >= 0) {
      database.submittedDistributions[nextIndex] = {
        ...database.submittedDistributions[nextIndex],
        deliveryStatus: "active",
      };
    }

    this.writeDatabase(database);
    return this.getDeliveries();
  }

  async getReports(): Promise<ReportsResponse> {
    return this.readDatabase().reports;
  }

  async getInventory(_options?: { q?: string; page?: number; limit?: number }): Promise<InventoryResponse> {
    const database = this.readDatabase();
    const storedInventory = database.inventory?.items ?? [];

    return {
      items: storedInventory.sort((left, right) => left.expiryDate.localeCompare(right.expiryDate)),
    };
  }

  async listBranches(): Promise<BranchListResponse> {
    const database = this.readDatabase();
    const outletId = database.distributionDraft.outletId;
    const outletName = database.distributionDraft.outletName;

    if (!outletId || !outletName) {
      return { branches: [] };
    }

    return {
      branches: [
        {
          id: outletId,
          name: outletName,
          area: "Unknown",
          phone: database.distributionDraft.outletPhone ?? null,
          isActive: true,
        },
      ],
    };
  }

  async updateBranch(id: string, input: BranchUpdateRequest): Promise<Branch> {
    const database = this.readDatabase();

    if (!database.distributionDraft.outletId || database.distributionDraft.outletId !== id) {
      throw new Error("Branch not found.");
    }

    const name = input.name?.trim();

    if (name !== undefined && !name) {
      throw new Error("Branch name is required.");
    }

    if (name) {
      database.distributionDraft.outletName = name;
      this.writeDatabase(database);
    }

    return {
      id,
      name: database.distributionDraft.outletName,
      area: "Unknown",
      phone: database.distributionDraft.outletPhone ?? null,
      isActive: input.isActive ?? true,
    };
  }

  async createInventoryItem(input: InventoryCreateRequest): Promise<InventoryItem> {
    const database = this.readDatabase();
    const drugName = input.drugName.trim();
    const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
    const expiryDate = parseExpiryDate(input.expiryDate);
    const costPrice = Math.max(0, Math.round(Number(input.costPrice) || 0));
    const category = input.category?.trim() || "Medicine";
    const kind = input.kind ?? "pill";

    if (!drugName || quantity <= 0 || costPrice <= 0) {
      throw new Error("Drug name, quantity, expiry date, and cost price are required.");
    }

    const existingProductIndex = database.distributionDraft.products.findIndex(
      (product) => product.name.toLowerCase() === drugName.toLowerCase(),
    );
    const productId =
      existingProductIndex >= 0
        ? database.distributionDraft.products[existingProductIndex].id
        : `prd_${randomUUID()}`;
    const draftProduct = {
      id: productId,
      name: drugName,
      category,
      kind,
      price: costPrice,
      color: colorForProduct(kind),
      quantity: 0,
    };

    if (existingProductIndex >= 0) {
      database.distributionDraft.products[existingProductIndex] = draftProduct;
    } else {
      database.distributionDraft.products.push(draftProduct);
    }

    const item: InventoryItem = {
      id: `inv_${randomUUID()}`,
      drugName,
      quantity,
      expiryDate: formatDateOnly(expiryDate),
      costPrice,
      batchNumber: createBatchNumber(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    database.inventory = {
      items: [item, ...(database.inventory?.items ?? [])],
    };
    this.writeDatabase(database);

    return item;
  }

  async updateInventoryItem(id: string, input: InventoryUpdateRequest): Promise<InventoryItem> {
    const database = this.readDatabase();
    const items = database.inventory?.items ?? [];
    const index = items.findIndex((item) => item.id === id);

    if (index < 0) {
      throw new Error("Inventory item not found.");
    }

    const current = items[index];
    const quantity =
      input.quantity === undefined ? current.quantity : Math.max(0, Math.floor(Number(input.quantity) || 0));
    const expiryDate = input.expiryDate === undefined ? current.expiryDate : formatDateOnly(parseExpiryDate(input.expiryDate));
    const costPrice =
      input.costPrice === undefined ? current.costPrice : Math.max(0, Math.round(Number(input.costPrice) || 0));

    if (quantity <= 0) {
      throw new Error("Quantity must be greater than 0.");
    }

    if (costPrice <= 0) {
      throw new Error("Cost price must be greater than 0.");
    }

    const updated: InventoryItem = {
      ...current,
      quantity,
      expiryDate,
      costPrice,
      updatedAt: nowIso(),
    };

    items[index] = updated;
    database.inventory = { items };
    this.writeDatabase(database);

    return updated;
  }

  async deleteInventoryItem(id: string): Promise<void> {
    const database = this.readDatabase();
    const items = database.inventory?.items ?? [];
    const nextItems = items.filter((item) => item.id !== id);

    if (nextItems.length === items.length) {
      throw new Error("Inventory item not found.");
    }

    database.inventory = { items: nextItems };
    this.writeDatabase(database);
  }

  async getDistributionDraft(): Promise<DistributionDraftResponse> {
    const database = this.readDatabase();
    const stockedNames = new Set(
      (database.inventory?.items ?? [])
        .filter((item) => item.quantity > 0)
        .map((item) => item.drugName.toLowerCase()),
    );

    return {
      ...database.distributionDraft,
      products: database.distributionDraft.products.filter((product) =>
        stockedNames.has(product.name.toLowerCase()),
      ),
    };
  }

  async createDistribution(input: DistributionCreateRequest) {
    const database = this.readDatabase();
    const outletName = input.outletName || database.distributionDraft.outletName;
    const vehicleName = input.vehicleName || database.distributionDraft.vehicleName;
    const selectedProducts = input.products ?? [];

    if (!outletName || !vehicleName) {
      throw new Error("Create an outlet, vehicle, and products in the backend before scheduling a distribution.");
    }

    const resolvedProducts = database.distributionDraft.products.map((product) => {
      const selected = selectedProducts.find((entry) => entry.id === product.id);
      const quantity = Math.max(0, Math.floor(selected?.quantity ?? product.quantity));

      return {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity,
      };
    });

    const selectedLineItems = resolvedProducts.filter((product) => product.quantity > 0);

    if (selectedLineItems.length === 0) {
      throw new Error("Select at least one product quantity before scheduling a distribution.");
    }

    for (const product of selectedLineItems) {
      const matchingInventory = (database.inventory?.items ?? []).filter(
        (item) => item.drugName.toLowerCase() === product.name.toLowerCase(),
      );
      const availableQuantity = matchingInventory.reduce((sum, item) => sum + item.quantity, 0);

      if (availableQuantity < product.quantity) {
        throw new Error(
          `Not enough stock for ${product.name}. Available: ${availableQuantity}, requested: ${product.quantity}.`,
        );
      }
    }

    const selectedBatchLookup = new Map(
      selectedLineItems.map((product) => {
        const batch = (database.inventory?.items ?? [])
          .filter((item) => item.drugName.toLowerCase() === product.name.toLowerCase())
          .sort((left, right) => left.expiryDate.localeCompare(right.expiryDate))[0];

        return [product.id, batch] as const;
      }),
    );

    for (const product of selectedLineItems) {
      let remainingQuantity = product.quantity;
      const matchingInventory = (database.inventory?.items ?? [])
        .filter((item) => item.drugName.toLowerCase() === product.name.toLowerCase())
        .sort((left, right) => left.expiryDate.localeCompare(right.expiryDate));

      for (const item of matchingInventory) {
        if (remainingQuantity <= 0) {
          break;
        }

        const deductedQuantity = Math.min(item.quantity, remainingQuantity);
        item.quantity -= deductedQuantity;
        remainingQuantity -= deductedQuantity;
      }
    }

    if (database.inventory) {
      database.inventory.items = database.inventory.items.filter((item) => item.quantity > 0);
    }

    const units = selectedLineItems.reduce((sum, product) => sum + product.quantity, 0);
    const subtotal = selectedLineItems.reduce((sum, product) => sum + product.quantity * product.price, 0);
    const total = subtotal + database.distributionDraft.deliveryFee;
    const distributionId = createDistributionId();
    const createdAt = nowIso();

    const record: SubmittedDistributionRecord = {
      distributionId,
      outletName,
      vehicleName,
      units,
      total: formatCurrency(total),
      eta: formatScheduleEta(input.dateValue || database.distributionDraft.dateValue),
      status: "scheduled",
      createdAt,
      dateValue: input.dateValue || database.distributionDraft.dateValue,
      deliveryFee: database.distributionDraft.deliveryFee,
      deliveryStatus: "active",
      signature: input.signature?.trim() || null,
      items: selectedLineItems.length,
      outletPhone: database.distributionDraft.outletPhone ?? null,
      products: selectedLineItems.map((product) => {
        const batch = selectedBatchLookup.get(product.id);

        return {
          ...product,
          expiryDate: batch?.expiryDate,
          batchNumber: batch?.batchNumber,
        };
      }),
    };

    database.submittedDistributions.unshift(record);
    database.orders.orders.unshift({
      id: createOrderId(database.orders.orders.length),
      outlet: record.outletName,
      items: record.items,
      lineItems: record.products.map((product) => ({
        drugName: product.name,
        quantity: product.quantity,
        expiryDate: product.expiryDate ?? record.dateValue,
        costPrice: product.price,
        batchNumber: product.batchNumber ?? "N/A",
      })),
      signature: record.signature ?? null,
      units: record.units,
      amount: record.total,
      amountValue: total,
      status: "processing",
      date: createdAt.slice(0, 10),
      time: formatCreatedTime(),
    });

    database.dashboard.stats.total += record.units;
    const outletKey = record.outletName.toLowerCase();
    if (outletKey.includes("ashongman")) {
      database.dashboard.stats.ashongman += record.units;
    } else if (outletKey.includes("nima")) {
      database.dashboard.stats.nima += record.units;
    }

    database.reports.unitsSold += record.units;
    database.reports.revenue = formatCurrency(
      Number(database.reports.revenue.replace(/[^0-9.]/g, "").replace(/,/g, "")) + total,
    );
    database.deliveries.totalUnits += record.units;

    this.writeDatabase(database);

    const response: DistributionCreateResponse = {
      distributionId: record.distributionId,
      outletName: record.outletName,
      vehicleName: record.vehicleName,
      units: record.units,
      total: record.total,
      eta: record.eta,
      status: record.status,
    };

    return response;
  }

  async createOutlet(input: SetupOutletRequest): Promise<SetupOutletResponse> {
    const database = this.readDatabase();
    const name = input.name.trim();
    const area = input.area.trim();
    const phone = input.phone?.trim() || null;

    if (!name || !area) {
      throw new Error("Outlet name and area are required.");
    }

    const id = database.distributionDraft.outletId ?? `out_${randomUUID()}`;
    database.distributionDraft.outletId = id;
    database.distributionDraft.outletName = name;
    database.distributionDraft.outletPhone = phone;
    this.writeDatabase(database);

    return { id, name, area, phone };
  }

  async createVehicle(input: SetupVehicleRequest): Promise<SetupVehicleResponse> {
    const database = this.readDatabase();
    const name = input.name.trim();
    const registrationNumber = input.registrationNumber.trim().toUpperCase();
    const driverName = input.driverName.trim();
    const defaultDeliveryFee = Math.max(0, Math.round(Number(input.defaultDeliveryFee) || 0));

    if (!name || !registrationNumber || !driverName) {
      throw new Error("Vehicle name, registration number, and driver name are required.");
    }

    const id = database.distributionDraft.vehicleId ?? `veh_${randomUUID()}`;
    database.distributionDraft.vehicleId = id;
    database.distributionDraft.vehicleName = name;
    database.distributionDraft.driverName = driverName;
    database.distributionDraft.deliveryFee = defaultDeliveryFee;
    this.writeDatabase(database);

    return { id, name, registrationNumber, driverName, defaultDeliveryFee };
  }

  async createProduct(input: SetupProductRequest): Promise<SetupProductResponse> {
    const database = this.readDatabase();
    const name = input.name.trim();
    const category = input.category.trim();
    const kind = input.kind;
    const price = Math.max(0, Math.round(Number(input.price) || 0));
    const color = colorForProduct(kind);

    if (!name || !category || price <= 0) {
      throw new Error("Product name, category, and a positive price are required.");
    }

    const existingIndex = database.distributionDraft.products.findIndex(
      (product) => product.name.toLowerCase() === name.toLowerCase(),
    );
    const product = {
      id: existingIndex >= 0 ? database.distributionDraft.products[existingIndex].id : `prd_${randomUUID()}`,
      name,
      category,
      kind,
      price,
      color,
      quantity: 0,
    };

    if (existingIndex >= 0) {
      database.distributionDraft.products[existingIndex] = product;
    } else {
      database.distributionDraft.products.push(product);
    }

    this.writeDatabase(database);

    return {
      id: product.id,
      name: product.name,
      category: product.category,
      kind: product.kind,
      price: product.price,
      color: product.color,
    };
  }
}
