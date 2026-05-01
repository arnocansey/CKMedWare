import { createHash, randomUUID } from "node:crypto";
import {
  DeliveryStopStatus,
  DistributionStatus,
  PurchaseOrderStatus,
  UserRole,
  type Prisma,
  type ProductKind as PrismaProductKind,
  type User as PrismaUser,
} from "../../generated/prisma/client.js";

import type { DataStore } from "./data-store.js";
import { getPrismaClient } from "../lib/prisma.js";
import type {
  Branch,
  BranchListResponse,
  BranchUpdateRequest,
  DashboardResponse,
  DeliveriesResponse,
  DeliveryStop,
  DistributionCreateRequest,
  DistributionCreateResponse,
  DistributionDraftResponse,
  ExpiryItem,
  InventoryCreateRequest,
  InventoryUpdateRequest,
  InventoryItem,
  InventoryResponse,
  LoginResponse,
  OrdersResponse,
  PurchaseOrder,
  PurchaseOrderCreateRequest,
  PurchaseOrdersResponse,
  ProductKind,
  ReportsResponse,
  SetupOutletRequest,
  SetupOutletResponse,
  SetupProductRequest,
  SetupProductResponse,
  SetupVehicleRequest,
  SetupVehicleResponse,
  SignupRequest,
  User,
} from "../types.js";

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

function createToken() {
  return `ckm_${randomUUID().replaceAll("-", "")}`;
}

function getSessionTtlDays() {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 30);
  if (!Number.isFinite(days) || days <= 0) {
    return 30;
  }
  return Math.floor(days);
}

function toUser(user: PrismaUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function startOfWeek(value = new Date()) {
  const date = startOfDay(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function formatCurrency(value: number) {
  return `GHS ${Math.round(value).toLocaleString()}`;
}

function formatLongDate(value = new Date()) {
  return value.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatTime(value: Date) {
  return value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatOrderTime(value: Date) {
  const today = startOfDay();
  const createdDay = startOfDay(value);
  const diffDays = Math.round((today.getTime() - createdDay.getTime()) / 86400000);

  if (diffDays === 0) {
    return `Today - ${formatTime(value)}`;
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  return formatShortDate(value);
}

function formatScheduleEta(value: Date) {
  const today = startOfDay();
  const targetDay = startOfDay(value);
  const diffDays = Math.round((targetDay.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) {
    return `Today - ${formatTime(value)}`;
  }

  if (diffDays === 1) {
    return `Tomorrow - ${formatTime(value)}`;
  }

  return `${formatShortDate(value)} - ${formatTime(value)}`;
}

function percentageChange(current: number, previous: number) {
  if (current === 0 && previous === 0) {
    return 0;
  }

  if (previous === 0) {
    return 100;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function createOrderNumber() {
  const segment = randomUUID().slice(0, 6).toUpperCase();
  return `ORD-${segment}`;
}

function createPurchaseOrderNumber() {
  const segment = randomUUID().slice(0, 6).toUpperCase();
  return `PO-${segment}`;
}

function createBatchNumber() {
  const segment = randomUUID().slice(0, 8).toUpperCase();
  return `BATCH-${segment}`;
}

function determineSeverity(days: number): ExpiryItem["severity"] {
  if (days <= 14) {
    return "urgent";
  }

  if (days <= 45) {
    return "warn";
  }

  return "soft";
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

function toProductKind(kind: PrismaProductKind): ProductKind {
  return kind;
}

function normalizeProductKind(kind: ProductKind): PrismaProductKind {
  if (["pill", "liquid", "syringe", "tablets"].includes(kind)) {
    return kind;
  }

  throw new Error("Select a valid product type.");
}

function createScheduledDate(dateValue?: string) {
  if (!dateValue) {
    const now = new Date();
    now.setSeconds(0, 0);
    return now;
  }

  const nextValue = new Date(`${dateValue}T09:00:00`);

  if (Number.isNaN(nextValue.getTime())) {
    throw new Error("Enter a valid distribution date.");
  }

  return nextValue;
}

function parseExpiryDate(value: string) {
  const expiryDate = new Date(`${value}T00:00:00`);

  if (!value || Number.isNaN(expiryDate.getTime())) {
    throw new Error("Enter a valid expiry date.");
  }

  if (expiryDate < startOfDay()) {
    throw new Error("Expiry date cannot be in the past.");
  }

  return expiryDate;
}

function sumUnits(
  items: Array<{
    quantity: number;
  }>,
) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function isAreaMatch(value: string, needle: string) {
  return value.toLowerCase().includes(needle.toLowerCase());
}

type DashboardDistribution = Prisma.DistributionGetPayload<{
  include: {
    outlet: true;
    items: true;
  };
}>;

type DistributionWithRelations = Prisma.DistributionGetPayload<{
  include: {
    outlet: true;
    vehicle: true;
    items: {
      include: {
        product: true;
      };
    };
  };
}>;

type DeliveryStopWithRelations = Prisma.DeliveryStopGetPayload<{
  include: {
    outlet: true;
    vehicle: true;
    distribution: {
      include: {
        items: true;
      };
    };
  };
}>;

type OrderDistribution = Prisma.DistributionGetPayload<{
  include: {
    outlet: true;
    items: {
      include: {
        product: {
          include: {
            stockBatches: true;
          };
        };
      };
    };
  };
}>;

export class PrismaStore implements DataStore {
  private bootstrapPromise: Promise<void> | null = null;

  private get prisma() {
    return getPrismaClient();
  }

  private async ensureBootstrapUser() {
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    this.bootstrapPromise = (async () => {
      const name = process.env.ADMIN_NAME?.trim();
      const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const password = process.env.ADMIN_PASSWORD?.trim();

      if (!name || !email || !password) {
        return;
      }

      await this.prisma.user.upsert({
        where: { email },
        update: {
          name,
          passwordHash: hashPassword(password),
          role: UserRole.admin,
        },
        create: {
          id: "usr_bootstrap_admin",
          name,
          email,
          passwordHash: hashPassword(password),
          role: UserRole.admin,
        },
      });
    })();

    await this.bootstrapPromise;
  }

  async authenticate(email: string, password: string) {
    await this.ensureBootstrapUser();

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.passwordHash !== hashPassword(password)) {
      return null;
    }

    await this.prisma.session.deleteMany({
      where: { userId: user.id },
    });

    const token = createToken();
    await this.prisma.session.create({
      data: {
        token,
        userId: user.id,
      },
    });

    const result: LoginResponse = {
      token,
      user: toUser(user),
    };

    return result;
  }

  async signup(input: SignupRequest) {
    await this.ensureBootstrapUser();

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();

    if (!name || !email || !password) {
      throw new Error("Name, email, and password are required.");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new Error("An account already exists for this email.");
    }

    const hasUsers = (await this.prisma.user.count()) > 0;
    const user = await this.prisma.user.create({
      data: {
        id: `usr_${randomUUID()}`,
        name,
        email,
        passwordHash: hashPassword(password),
        role: hasUsers ? UserRole.dispatcher : UserRole.admin,
      },
    });

    const token = createToken();
    await this.prisma.session.create({
      data: {
        token,
        userId: user.id,
      },
    });

    const result: LoginResponse = {
      token,
      user: toUser(user),
    };

    return result;
  }

  async getUserForToken(token: string) {
    await this.ensureBootstrapUser();
    const ttlDays = getSessionTtlDays();
    const now = new Date();
    const minCreatedAt = addDays(now, -ttlDays);

    await this.prisma.session.deleteMany({
      where: {
        createdAt: {
          lt: minCreatedAt,
        },
      },
    });

    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    return toUser(session.user);
  }

  async getDashboard(user: User): Promise<DashboardResponse> {
    await this.ensureBootstrapUser();

    const weekStart = startOfWeek();
    const nextWeek = addDays(weekStart, 7);
    const today = new Date();

    const [distributions, expiryBatches] = await Promise.all([
      this.prisma.distribution.findMany({
        where: {
          scheduledFor: {
            gte: weekStart,
            lt: nextWeek,
          },
          status: {
            not: DistributionStatus.cancelled,
          },
        },
        include: {
          outlet: true,
          items: true,
        },
      }),
      this.prisma.stockBatch.findMany({
        where: {
          unitsRemaining: { gt: 0 },
          expiresAt: {
            gte: startOfDay(today),
            lte: addDays(startOfDay(today), 90),
          },
        },
        include: {
          product: true,
        },
        orderBy: {
          expiresAt: "asc",
        },
        take: 5,
      }),
    ]);

    const stats = distributions.reduce(
      (
        accumulator: { total: number; ashongman: number; nima: number },
        distribution: DashboardDistribution,
      ) => {
        const units = sumUnits(distribution.items);
        const areaLabel = `${distribution.outlet.area} ${distribution.outlet.name}`;
        accumulator.total += units;

        if (isAreaMatch(areaLabel, "ashongman")) {
          accumulator.ashongman += units;
        }

        if (isAreaMatch(areaLabel, "nima")) {
          accumulator.nima += units;
        }

        return accumulator;
      },
      { total: 0, ashongman: 0, nima: 0 },
    );

    return {
      dayLabel: formatLongDate(today),
      snapshotLabel:
        stats.total > 0 ? "Live distribution snapshot" : "No distributions recorded yet",
      user,
      stats,
      expiryWatchlist: expiryBatches.map((batch: typeof expiryBatches[number]) => {
        const days = Math.max(
          0,
          Math.ceil((startOfDay(batch.expiresAt).getTime() - startOfDay(today).getTime()) / 86400000),
        );

        return {
          name: batch.product.name,
          batch: batch.batchNumber,
          days,
          units: batch.unitsRemaining,
          severity: determineSeverity(days),
        };
      }),
    };
  }

  async getOrders(): Promise<OrdersResponse> {
    await this.ensureBootstrapUser();

    const distributions = await this.prisma.distribution.findMany({
      include: {
        outlet: true,
        items: {
          include: {
            product: {
              include: {
                stockBatches: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return {
      filters: ["All", "Pending", "Processing", "Delivered", "Cancelled"],
      orders: distributions.map((distribution: OrderDistribution) => {
        const lineItems = distribution.items.map((item: OrderDistribution["items"][number]) => {
          const batch = [...item.product.stockBatches].sort(
            (left, right) => left.expiresAt.getTime() - right.expiresAt.getTime(),
          )[0];

          return {
            drugName: item.product.name,
            quantity: item.quantity,
            expiryDate: batch ? formatDateOnly(batch.expiresAt) : formatDateOnly(distribution.scheduledFor),
            costPrice: item.unitPrice,
            batchNumber: batch?.batchNumber ?? "N/A",
          };
        });

        return {
          id: distribution.orderNumber,
          outlet: distribution.outlet.name,
          items: distribution.items.length,
          lineItems,
          signature: distribution.signature,
          units: sumUnits(distribution.items),
          amount: formatCurrency(distribution.totalAmount),
          amountValue: distribution.totalAmount,
          status: distribution.status,
          date: formatDateOnly(distribution.createdAt),
          time: formatOrderTime(distribution.createdAt),
        };
      }),
    };
  }

  async getPurchaseOrders(options?: { q?: string; page?: number; limit?: number }): Promise<PurchaseOrdersResponse> {
    await this.ensureBootstrapUser();
    const q = options?.q?.trim();
    const page = Math.max(1, Math.floor(options?.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(options?.limit ?? 50)));
    const skip = (page - 1) * limit;

    const orders = await this.prisma.purchaseOrder.findMany({
      where: q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: "insensitive" } },
              { supplierName: { contains: q, mode: "insensitive" } },
              { items: { some: { drugName: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : undefined,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return {
      filters: ["All", "Pending", "Received"],
      orders: orders.map((order: typeof orders[number]): PurchaseOrder => {
        const totalValue = order.items.reduce((sum: number, item: typeof order.items[number]) => sum + item.quantity * item.costPrice, 0);

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          supplier: order.supplierName,
          status: order.status === PurchaseOrderStatus.received ? "received" : "pending",
          items: order.items.length,
          units: order.items.reduce((sum: number, item: typeof order.items[number]) => sum + item.quantity, 0),
          total: formatCurrency(totalValue),
          totalValue,
          date: formatDateOnly(order.createdAt),
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
          lineItems: order.items.map((item: typeof order.items[number]) => ({
            drugName: item.drugName,
            quantity: item.quantity,
            expiryDate: formatDateOnly(item.expiresAt),
            costPrice: item.costPrice,
            batchNumber: item.batchNumber,
          })),
        };
      }),
    };
  }

  async createPurchaseOrder(input: PurchaseOrderCreateRequest): Promise<PurchaseOrder> {
    await this.ensureBootstrapUser();

    const supplierName = input.supplierName.trim();

    if (!supplierName) {
      throw new Error("Supplier name is required.");
    }

    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error("Add at least one order item.");
    }

    const items = input.items.map((item) => {
      const drugName = item.drugName.trim();
      const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
      const expiresAt = parseExpiryDate(item.expiryDate);
      const costPrice = Math.max(0, Math.round(Number(item.costPrice) || 0));

      if (!drugName || quantity <= 0 || costPrice <= 0) {
        throw new Error("Each order item must include drug name, quantity, expiry date, and cost price.");
      }

      return {
        drugName,
        quantity,
        expiresAt,
        costPrice,
      };
    });

    const order = await this.prisma.purchaseOrder.create({
      data: {
        orderNumber: createPurchaseOrderNumber(),
        supplierName,
        status: PurchaseOrderStatus.pending,
        items: {
          create: items,
        },
      },
      include: { items: true },
    });

    const totalValue = order.items.reduce((sum: number, item: typeof order.items[number]) => sum + item.quantity * item.costPrice, 0);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      supplier: order.supplierName,
      status: "pending",
      items: order.items.length,
      units: order.items.reduce((sum: number, item: typeof order.items[number]) => sum + item.quantity, 0),
      total: formatCurrency(totalValue),
      totalValue,
      date: formatDateOnly(order.createdAt),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      lineItems: order.items.map((item: typeof order.items[number]) => ({
        drugName: item.drugName,
        quantity: item.quantity,
        expiryDate: formatDateOnly(item.expiresAt),
        costPrice: item.costPrice,
        batchNumber: item.batchNumber,
      })),
    };
  }

  async receivePurchaseOrder(id: string): Promise<PurchaseOrder> {
    await this.ensureBootstrapUser();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.purchaseOrder.findFirst({
        where: { id },
        include: { items: true },
      });

      if (!existing) {
        throw new Error("Order not found.");
      }

      if (existing.status === PurchaseOrderStatus.received) {
        return;
      }

      const outlet = await tx.outlet.upsert({
        where: { name: "Main Pharmacy Store" },
        update: { area: "Inventory", isActive: true },
        create: { name: "Main Pharmacy Store", area: "Inventory" },
      });

      for (const item of existing.items) {
        const product = await tx.product.upsert({
          where: { name: item.drugName },
          update: {
            price: item.costPrice,
            isActive: true,
          },
          create: {
            name: item.drugName,
            category: "Medicine",
            kind: normalizeProductKind("pill"),
            price: item.costPrice,
            color: colorForProduct("pill"),
          },
        });

        const batchNumber = createBatchNumber();

        await tx.stockBatch.create({
          data: {
            batchNumber,
            productId: product.id,
            outletId: outlet.id,
            expiresAt: item.expiresAt,
            unitsRemaining: item.quantity,
          },
        });

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { batchNumber },
        });
      }

      await tx.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          status: PurchaseOrderStatus.received,
          receivedAt: new Date(),
        },
      });
    }, { isolationLevel: "Serializable" });

    const updated = await this.prisma.purchaseOrder.findFirstOrThrow({
      where: { id },
      include: { items: true },
    });

    const totalValue = updated.items.reduce((sum: number, item: typeof updated.items[number]) => sum + item.quantity * item.costPrice, 0);

    return {
      id: updated.id,
      orderNumber: updated.orderNumber,
      supplier: updated.supplierName,
      status: "received",
      items: updated.items.length,
      units: updated.items.reduce((sum: number, item: typeof updated.items[number]) => sum + item.quantity, 0),
      total: formatCurrency(totalValue),
      totalValue,
      date: formatDateOnly(updated.createdAt),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      lineItems: updated.items.map((item: typeof updated.items[number]) => ({
        drugName: item.drugName,
        quantity: item.quantity,
        expiryDate: formatDateOnly(item.expiresAt),
        costPrice: item.costPrice,
        batchNumber: item.batchNumber,
      })),
    };
  }

  private mapDeliveryStop(stop: DeliveryStopWithRelations): DeliveryStop {
    const units = sumUnits(stop.distribution.items);
    let eta = `ETA ${formatTime(stop.scheduledTime)}`;

    if (stop.status === DeliveryStopStatus.done) {
      eta = stop.deliveredAt ? `Delivered ${formatTime(stop.deliveredAt)}` : "Delivered";
    } else if (stop.status === DeliveryStopStatus.active) {
      eta = `In progress - ${formatTime(stop.scheduledTime)}`;
    }

    return {
      id: stop.sequence,
      time: formatTime(stop.scheduledTime),
      outlet: stop.outlet.name,
      area: stop.outlet.area,
      units,
      status: stop.status,
      eta,
    };
  }

  async getDeliveries(): Promise<DeliveriesResponse> {
    await this.ensureBootstrapUser();

    const today = startOfDay();
    const tomorrow = addDays(today, 1);

    const stops = await this.prisma.deliveryStop.findMany({
      where: {
        scheduledTime: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        outlet: true,
        vehicle: true,
        distribution: {
          include: {
            items: true,
          },
        },
      },
      orderBy: [{ sequence: "asc" }, { scheduledTime: "asc" }],
    });

    const mappedStops = stops.map((stop: DeliveryStopWithRelations) => this.mapDeliveryStop(stop));
    const focusedStop =
      mappedStops.find((stop: DeliveryStop) => stop.status === "active") ??
      mappedStops.find((stop: DeliveryStop) => stop.status === "next") ??
      null;

    return {
      routeId: stops[0]?.routeCode ?? "",
      totalUnits: stops.reduce(
        (sum: number, stop: DeliveryStopWithRelations) => sum + sumUnits(stop.distribution.items),
        0,
      ),
      activeStop: focusedStop,
      stops: mappedStops,
    };
  }

  private summarizeDistributions(distributions: DistributionWithRelations[]) {
    const revenue = distributions.reduce((sum, distribution) => sum + distribution.totalAmount, 0);
    const units = distributions.reduce((sum, distribution) => sum + sumUnits(distribution.items), 0);

    return { revenue, units };
  }

  async getReports(): Promise<ReportsResponse> {
    await this.ensureBootstrapUser();

    const currentWeekStart = startOfWeek();
    const nextWeekStart = addDays(currentWeekStart, 7);
    const previousWeekStart = addDays(currentWeekStart, -7);

    const [currentWeek, previousWeek] = await Promise.all([
      this.prisma.distribution.findMany({
        where: {
          scheduledFor: {
            gte: currentWeekStart,
            lt: nextWeekStart,
          },
          status: {
            not: DistributionStatus.cancelled,
          },
        },
        include: {
          outlet: true,
          vehicle: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      }),
      this.prisma.distribution.findMany({
        where: {
          scheduledFor: {
            gte: previousWeekStart,
            lt: currentWeekStart,
          },
          status: {
            not: DistributionStatus.cancelled,
          },
        },
        include: {
          outlet: true,
          vehicle: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      }),
    ]);

    const currentSummary = this.summarizeDistributions(currentWeek);
    const previousSummary = this.summarizeDistributions(previousWeek);

    const bars = Array.from({ length: 7 }, (_, index) => {
      const day = addDays(currentWeekStart, index);
      const dayKey = formatDateOnly(day);
      const value = currentWeek
        .filter((distribution: DistributionWithRelations) => formatDateOnly(distribution.scheduledFor) === dayKey)
        .reduce(
          (sum: number, distribution: DistributionWithRelations) => sum + sumUnits(distribution.items),
          0,
        );

      return {
        day: day.toLocaleDateString("en-GB", { weekday: "short" }),
        value,
      };
    });

    const maxBarValue = Math.max(0, ...bars.map((bar) => bar.value));
    const currentProductTotals = new Map<
      string,
      {
        name: string;
        category: string;
        kind: ProductKind;
        units: number;
      }
    >();
    const previousProductTotals = new Map<string, number>();

    for (const distribution of currentWeek) {
      for (const item of distribution.items) {
        const existing = currentProductTotals.get(item.productId);
        currentProductTotals.set(item.productId, {
          name: item.product.name,
          category: item.product.category,
          kind: toProductKind(item.product.kind),
          units: (existing?.units ?? 0) + item.quantity,
        });
      }
    }

    for (const distribution of previousWeek) {
      for (const item of distribution.items) {
        previousProductTotals.set(item.productId, (previousProductTotals.get(item.productId) ?? 0) + item.quantity);
      }
    }

    const topProducts = Array.from(currentProductTotals.entries())
      .map(([productId, product]: [string, { name: string; category: string; kind: ProductKind; units: number }]) => ({
        ...product,
        trend: percentageChange(product.units, previousProductTotals.get(productId) ?? 0),
      }))
      .sort((left, right) => right.units - left.units)
      .slice(0, 4);

    return {
      period: "This week",
      revenue: formatCurrency(currentSummary.revenue),
      revenueTrend: percentageChange(currentSummary.revenue, previousSummary.revenue),
      unitsSold: currentSummary.units,
      unitsSoldTrend: percentageChange(currentSummary.units, previousSummary.units),
      bars: bars.map((bar) => ({
        ...bar,
        highlight: maxBarValue > 0 && bar.value === maxBarValue,
      })),
      topProducts,
    };
  }

  async getInventory(options?: { q?: string; page?: number; limit?: number }): Promise<InventoryResponse> {
    await this.ensureBootstrapUser();
    const q = options?.q?.trim();
    const page = Math.max(1, Math.floor(options?.page ?? 1));
    const limit = Math.min(200, Math.max(1, Math.floor(options?.limit ?? 200)));
    const skip = (page - 1) * limit;

    const batches = await this.prisma.stockBatch.findMany({
      where: {
        unitsRemaining: {
          gt: 0,
        },
        ...(q
          ? {
              OR: [
                { batchNumber: { contains: q, mode: "insensitive" } },
                { product: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        product: true,
      },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    });

    return {
      items: batches.map((batch: typeof batches[number]): InventoryItem => ({
        id: batch.id,
        drugName: batch.product.name,
        quantity: batch.unitsRemaining,
        expiryDate: formatDateOnly(batch.expiresAt),
        costPrice: batch.product.price,
        batchNumber: batch.batchNumber,
        createdAt: batch.createdAt.toISOString(),
        updatedAt: batch.updatedAt.toISOString(),
      })),
    };
  }

  async listBranches(): Promise<BranchListResponse> {
    await this.ensureBootstrapUser();

    const outlets = await this.prisma.outlet.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return {
      branches: outlets.map((outlet: typeof outlets[number]): Branch => ({
        id: outlet.id,
        name: outlet.name,
        area: outlet.area,
        isActive: outlet.isActive,
      })),
    };
  }

  async updateBranch(id: string, input: BranchUpdateRequest): Promise<Branch> {
    await this.ensureBootstrapUser();

    const existing = await this.prisma.outlet.findFirst({ where: { id } });

    if (!existing) {
      throw new Error("Branch not found.");
    }

    const name = input.name?.trim();
    const area = input.area?.trim();

    if (name !== undefined && !name) {
      throw new Error("Branch name is required.");
    }

    if (area !== undefined && !area) {
      throw new Error("Branch area is required.");
    }

    if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
      const conflict = await this.prisma.outlet.findFirst({
        where: { name, NOT: { id: existing.id } },
        select: { id: true },
      });

      if (conflict) {
        throw new Error("Another branch already uses that name.");
      }
    }

    const outlet = await this.prisma.outlet.update({
      where: { id },
      data: {
        name: name ?? undefined,
        area: area ?? undefined,
        isActive: input.isActive ?? undefined,
      },
    });

    return {
      id: outlet.id,
      name: outlet.name,
      area: outlet.area,
      isActive: outlet.isActive,
    };
  }

  async createInventoryItem(input: InventoryCreateRequest): Promise<InventoryItem> {
    await this.ensureBootstrapUser();

    const drugName = input.drugName.trim();
    const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
    const expiryDate = parseExpiryDate(input.expiryDate);
    const costPrice = Math.max(0, Math.round(Number(input.costPrice) || 0));
    const category = input.category?.trim() || "Medicine";
    const kind = normalizeProductKind(input.kind ?? "pill");

    if (!drugName || quantity <= 0 || costPrice <= 0) {
      throw new Error("Drug name, quantity, expiry date, and cost price are required.");
    }

    const [product, outlet] = await Promise.all([
      this.prisma.product.upsert({
        where: { name: drugName },
        update: {
          category,
          kind,
          price: costPrice,
          color: colorForProduct(toProductKind(kind)),
          isActive: true,
        },
        create: {
          name: drugName,
          category,
          kind,
          price: costPrice,
          color: colorForProduct(toProductKind(kind)),
        },
      }),
      this.prisma.outlet.upsert({
        where: { name: "Main Pharmacy Store" },
        update: {
          area: "Inventory",
          isActive: true,
        },
        create: {
          name: "Main Pharmacy Store",
          area: "Inventory",
        },
      }),
    ]);

    const batch = await this.prisma.stockBatch.create({
      data: {
        batchNumber: createBatchNumber(),
        productId: product.id,
        outletId: outlet.id,
        expiresAt: expiryDate,
        unitsRemaining: quantity,
      },
    });

    return {
      id: batch.id,
      drugName: product.name,
      quantity: batch.unitsRemaining,
      expiryDate: formatDateOnly(batch.expiresAt),
      costPrice: product.price,
      batchNumber: batch.batchNumber,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };
  }

  async updateInventoryItem(id: string, input: InventoryUpdateRequest): Promise<InventoryItem> {
    await this.ensureBootstrapUser();

    const batch = await this.prisma.stockBatch.findFirst({
      where: { id },
      include: { product: true },
    });

    if (!batch) {
      throw new Error("Inventory item not found.");
    }

    const quantity =
      input.quantity === undefined ? undefined : Math.max(0, Math.floor(Number(input.quantity) || 0));
    const expiryDate = input.expiryDate === undefined ? undefined : parseExpiryDate(input.expiryDate);
    const costPrice =
      input.costPrice === undefined ? undefined : Math.max(0, Math.round(Number(input.costPrice) || 0));

    if (quantity !== undefined && quantity <= 0) {
      throw new Error("Quantity must be greater than 0.");
    }

    if (costPrice !== undefined && costPrice <= 0) {
      throw new Error("Cost price must be greater than 0.");
    }

    const [updatedBatch, updatedProduct] = await this.prisma.$transaction([
      this.prisma.stockBatch.update({
        where: { id: batch.id },
        data: {
          unitsRemaining: quantity ?? undefined,
          expiresAt: expiryDate ?? undefined,
        },
      }),
      costPrice !== undefined
        ? this.prisma.product.update({
            where: { id: batch.productId },
            data: { price: costPrice },
          })
        : this.prisma.product.findFirstOrThrow({ where: { id: batch.productId } }),
    ]);

    return {
      id: updatedBatch.id,
      drugName: updatedProduct.name,
      quantity: updatedBatch.unitsRemaining,
      expiryDate: formatDateOnly(updatedBatch.expiresAt),
      costPrice: updatedProduct.price,
      batchNumber: updatedBatch.batchNumber,
      createdAt: updatedBatch.createdAt.toISOString(),
      updatedAt: updatedBatch.updatedAt.toISOString(),
    };
  }

  async deleteInventoryItem(id: string): Promise<void> {
    await this.ensureBootstrapUser();

    const existing = await this.prisma.stockBatch.findFirst({ where: { id } });

    if (!existing) {
      throw new Error("Inventory item not found.");
    }

    await this.prisma.stockBatch.delete({ where: { id } });
  }

  async getDistributionDraft(): Promise<DistributionDraftResponse> {
    await this.ensureBootstrapUser();

    const [outlet, vehicle, products] = await Promise.all([
      this.prisma.outlet.findFirst({
        where: { isActive: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.vehicle.findFirst({
        where: { isActive: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.product.findMany({
        where: {
          isActive: true,
          stockBatches: {
            some: {
              unitsRemaining: {
                gt: 0,
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const today = new Date();

    return {
      outletId: outlet?.id ?? null,
      outletName: outlet?.name ?? "",
      vehicleId: vehicle?.id ?? null,
      dateLabel: "Today",
      dateValue: formatDateOnly(today),
      vehicleName: vehicle?.name ?? "",
      driverName: vehicle?.driverName ?? "",
      deliveryFee: vehicle?.defaultDeliveryFee ?? 0,
      products: products.map((product: typeof products[number]) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: 0,
        kind: toProductKind(product.kind),
        color: colorForProduct(toProductKind(product.kind)),
      })),
    };
  }

  async createDistribution(input: DistributionCreateRequest) {
    await this.ensureBootstrapUser();

    const selectedProducts = (input.products ?? [])
      .map((product) => ({
        id: product.id,
        quantity: Math.max(0, Math.floor(product.quantity)),
      }))
      .filter((product) => product.quantity > 0);

    if (selectedProducts.length === 0) {
      throw new Error("Select at least one product quantity before scheduling a distribution.");
    }

    const outlet =
      (input.outletId
        ? await this.prisma.outlet.findFirst({
            where: {
              id: input.outletId,
              isActive: true,
            },
          })
        : null) ??
      (input.outletName
        ? await this.prisma.outlet.findFirst({
            where: {
              name: input.outletName,
              isActive: true,
            },
          })
        : null);

    if (!outlet) {
      throw new Error("Create an outlet in the backend before scheduling a distribution.");
    }

    const vehicle =
      (input.vehicleId
        ? await this.prisma.vehicle.findFirst({
            where: {
              id: input.vehicleId,
              isActive: true,
            },
          })
        : null) ??
      (input.vehicleName
        ? await this.prisma.vehicle.findFirst({
            where: {
              name: input.vehicleName,
              isActive: true,
            },
          })
        : null);

    if (!vehicle) {
      throw new Error("Create a vehicle in the backend before scheduling a distribution.");
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: selectedProducts.map((product) => product.id),
        },
        isActive: true,
      },
    });

    if (products.length !== selectedProducts.length) {
      throw new Error("One or more selected products no longer exist.");
    }

    const selectedProductMap = new Map(selectedProducts.map((product) => [product.id, product.quantity]));

    const lineItems = products.map((product: typeof products[number]) => ({
      productId: product.id,
      quantity: selectedProductMap.get(product.id) ?? 0,
      unitPrice: product.price,
    }));
    const units = lineItems.reduce((sum: number, item: typeof lineItems[number]) => sum + item.quantity, 0);
    const subtotal = lineItems.reduce(
      (sum: number, item: typeof lineItems[number]) => sum + item.quantity * item.unitPrice,
      0,
    );
    const scheduledFor = createScheduledDate(input.dateValue);
    const deliveryFee = vehicle.defaultDeliveryFee;
    const totalAmount = subtotal + deliveryFee;
    const scheduleDayStart = startOfDay(scheduledFor);
    const scheduleDayEnd = addDays(scheduleDayStart, 1);
    const sequence =
      (await this.prisma.deliveryStop.count({
        where: {
          vehicleId: vehicle.id,
          scheduledTime: {
            gte: scheduleDayStart,
            lt: scheduleDayEnd,
          },
        },
      })) + 1;

    const distribution = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const product of products) {
        const requestedQuantity = selectedProductMap.get(product.id) ?? 0;
        const stockBatches = await tx.stockBatch.findMany({
          where: {
            productId: product.id,
            unitsRemaining: {
              gt: 0,
            },
          },
        });
        const availableQuantity = stockBatches.reduce(
          (sum: number, batch: typeof stockBatches[number]) => sum + batch.unitsRemaining,
          0,
        );

        if (availableQuantity < requestedQuantity) {
          throw new Error(
            `Not enough stock for ${product.name}. Available: ${availableQuantity}, requested: ${requestedQuantity}.`,
          );
        }
      }

      const createdDistribution = await tx.distribution.create({
        data: {
          orderNumber: createOrderNumber(),
          outletId: outlet.id,
          vehicleId: vehicle.id,
          status: DistributionStatus.pending,
          scheduledFor,
          deliveryFee,
          totalAmount,
          signature: input.signature?.trim() || null,
          items: {
            create: lineItems,
          },
          deliveryStop: {
            create: {
              outletId: outlet.id,
              vehicleId: vehicle.id,
              routeCode: vehicle.registrationNumber,
              sequence,
              status: DeliveryStopStatus.next,
              scheduledTime: scheduledFor,
            },
          },
        },
      });

      for (const item of lineItems) {
        let remainingQuantity = item.quantity;
        const stockBatches = await tx.stockBatch.findMany({
          where: {
            productId: item.productId,
            unitsRemaining: {
              gt: 0,
            },
          },
          orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
        });

        for (const batch of stockBatches) {
          if (remainingQuantity <= 0) {
            break;
          }

          const deductedQuantity = Math.min(batch.unitsRemaining, remainingQuantity);
          await tx.stockBatch.update({
            where: {
              id: batch.id,
            },
            data: {
              unitsRemaining: batch.unitsRemaining - deductedQuantity,
            },
          });
          remainingQuantity -= deductedQuantity;
        }
      }

      return createdDistribution;
    }, { isolationLevel: "Serializable" });

    const response: DistributionCreateResponse = {
      distributionId: distribution.id,
      outletName: outlet.name,
      vehicleName: vehicle.name,
      units,
      total: formatCurrency(totalAmount),
      eta: formatScheduleEta(scheduledFor),
      status: "scheduled",
    };

    return response;
  }

  async createOutlet(input: SetupOutletRequest): Promise<SetupOutletResponse> {
    await this.ensureBootstrapUser();

    const name = input.name.trim();
    const area = input.area.trim();

    if (!name || !area) {
      throw new Error("Outlet name and area are required.");
    }

    const outlet = await this.prisma.outlet.upsert({
      where: { name },
      update: {
        area,
        isActive: true,
      },
      create: {
        name,
        area,
      },
    });

    return {
      id: outlet.id,
      name: outlet.name,
      area: outlet.area,
    };
  }

  async createVehicle(input: SetupVehicleRequest): Promise<SetupVehicleResponse> {
    await this.ensureBootstrapUser();

    const name = input.name.trim();
    const registrationNumber = input.registrationNumber.trim().toUpperCase();
    const driverName = input.driverName.trim();
    const defaultDeliveryFee = Math.max(0, Math.round(Number(input.defaultDeliveryFee) || 0));

    if (!name || !registrationNumber || !driverName) {
      throw new Error("Vehicle name, registration number, and driver name are required.");
    }

    const vehicle = await this.prisma.vehicle.upsert({
      where: { registrationNumber },
      update: {
        name,
        driverName,
        defaultDeliveryFee,
        isActive: true,
      },
      create: {
        name,
        registrationNumber,
        driverName,
        defaultDeliveryFee,
      },
    });

    return {
      id: vehicle.id,
      name: vehicle.name,
      registrationNumber: vehicle.registrationNumber,
      driverName: vehicle.driverName,
      defaultDeliveryFee: vehicle.defaultDeliveryFee,
    };
  }

  async createProduct(input: SetupProductRequest): Promise<SetupProductResponse> {
    await this.ensureBootstrapUser();

    const name = input.name.trim();
    const category = input.category.trim();
    const kind = normalizeProductKind(input.kind);
    const price = Math.max(0, Math.round(Number(input.price) || 0));
    const color = colorForProduct(toProductKind(kind));

    if (!name || !category || price <= 0) {
      throw new Error("Product name, category, and a positive price are required.");
    }

    const product = await this.prisma.product.upsert({
      where: { name },
      update: {
        category,
        kind,
        price,
        color,
        isActive: true,
      },
      create: {
        name,
        category,
        kind,
        price,
        color,
      },
    });

    return {
      id: product.id,
      name: product.name,
      category: product.category,
      kind: toProductKind(product.kind),
      price: product.price,
      color: product.color,
    };
  }
}
