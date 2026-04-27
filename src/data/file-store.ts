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
  ReportsResponse,
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
}
