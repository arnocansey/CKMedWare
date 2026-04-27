import { createHash } from "node:crypto";

import type { PersistedDatabase, PersistedUser } from "../types.js";

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

function getBootstrapUser(): PersistedUser | null {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (!name || !email || !password) {
    return null;
  }

  return {
    id: "usr_bootstrap_admin",
    name,
    email,
    role: "admin",
    passwordHash: hashPassword(password),
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function createSeedDatabase(): PersistedDatabase {
  const bootstrapUser = getBootstrapUser();

  return {
    users: bootstrapUser ? [bootstrapUser] : [],
    sessions: [],
    dashboard: {
      dayLabel: "",
      snapshotLabel: "",
      stats: {
        total: 0,
        ashongman: 0,
        nima: 0,
      },
      expiryWatchlist: [],
    },
    orders: {
      filters: ["All", "Pending", "Processing", "Delivered", "Cancelled"],
      orders: [],
    },
    deliveries: {
      routeId: "",
      totalUnits: 0,
      activeStop: null,
      stops: [],
    },
    reports: {
      period: "This week",
      revenue: "GHS 0",
      revenueTrend: 0,
      unitsSold: 0,
      unitsSoldTrend: 0,
      bars: [],
      topProducts: [],
    },
    distributionDraft: {
      outletId: null,
      outletName: "",
      vehicleId: null,
      dateLabel: "Today",
      dateValue: todayIsoDate(),
      vehicleName: "",
      driverName: "",
      deliveryFee: 0,
      products: [],
    },
    submittedDistributions: [],
  };
}

export function hashSeedPassword(password: string) {
  return hashPassword(password);
}
