import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createSeedDatabase } from "./seed.js";
import type { DataStore } from "./data-store.js";
import type {
  DashboardResponse,
  DeliveriesResponse,
  DistributionCreateRequest,
  DistributionCreateResponse,
  DistributionDraftResponse,
  LoginResponse,
  OrdersResponse,
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

export class FileStore implements DataStore {
  private readonly filePath: string;

  constructor() {
    const dataDir = path.resolve(process.cwd(), "data");
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

  async getUserForToken(token: string) {
    const database = this.readDatabase();
    const session = database.sessions.find((entry) => entry.token === token);

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
      user,
    };
  }

  async getOrders(): Promise<OrdersResponse> {
    return this.readDatabase().orders;
  }

  async getDeliveries(): Promise<DeliveriesResponse> {
    return this.readDatabase().deliveries;
  }

  async getReports(): Promise<ReportsResponse> {
    return this.readDatabase().reports;
  }

  async getDistributionDraft(): Promise<DistributionDraftResponse> {
    return this.readDatabase().distributionDraft;
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
      items: selectedLineItems.length,
      products: selectedLineItems,
    };

    database.submittedDistributions.unshift(record);
    database.orders.orders.unshift({
      id: createOrderId(database.orders.orders.length),
      outlet: record.outletName,
      items: record.items,
      units: record.units,
      amount: record.total,
      status: "processing",
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

    if (!name || !area) {
      throw new Error("Outlet name and area are required.");
    }

    const id = database.distributionDraft.outletId ?? `out_${randomUUID()}`;
    database.distributionDraft.outletId = id;
    database.distributionDraft.outletName = name;
    this.writeDatabase(database);

    return { id, name, area };
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
