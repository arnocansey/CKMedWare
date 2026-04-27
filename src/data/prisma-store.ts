import { createHash, randomUUID } from "node:crypto";
import {
  DeliveryStopStatus,
  DistributionStatus,
  UserRole,
  type Prisma,
  type ProductKind as PrismaProductKind,
  type User as PrismaUser,
} from "../../generated/prisma/client.js";

import type { DataStore } from "./data-store.js";
import { getPrismaClient } from "../lib/prisma.js";
import type {
  DashboardResponse,
  DeliveriesResponse,
  DeliveryStop,
  DistributionCreateRequest,
  DistributionCreateResponse,
  DistributionDraftResponse,
  ExpiryItem,
  LoginResponse,
  OrdersResponse,
  ProductKind,
  ReportsResponse,
  User,
} from "../types.js";

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

function createToken() {
  return `ckm_${randomUUID().replaceAll("-", "")}`;
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

  async getUserForToken(token: string) {
    await this.ensureBootstrapUser();

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
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return {
      filters: ["All", "Pending", "Processing", "Delivered", "Cancelled"],
      orders: distributions.map((distribution: DashboardDistribution) => ({
        id: distribution.orderNumber,
        outlet: distribution.outlet.name,
        items: distribution.items.length,
        units: sumUnits(distribution.items),
        amount: formatCurrency(distribution.totalAmount),
        status: distribution.status,
        time: formatOrderTime(distribution.createdAt),
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
        where: { isActive: true },
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

    const distribution = await this.prisma.distribution.create({
      data: {
        orderNumber: createOrderNumber(),
        outletId: outlet.id,
        vehicleId: vehicle.id,
        status: DistributionStatus.pending,
        scheduledFor,
        deliveryFee,
        totalAmount,
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
}
