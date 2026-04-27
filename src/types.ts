export type UserRole = "dispatcher" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type PersistedUser = User & {
  passwordHash: string;
};

export type DashboardStats = {
  total: number;
  ashongman: number;
  nima: number;
};

export type ExpiryItem = {
  name: string;
  batch: string;
  days: number;
  units: number;
  severity: "urgent" | "warn" | "soft";
};

export type DashboardResponse = {
  dayLabel: string;
  snapshotLabel: string;
  user: User;
  stats: DashboardStats;
  expiryWatchlist: ExpiryItem[];
};

export type StoredDashboardData = Omit<DashboardResponse, "user">;

export type OrderStatus = "pending" | "processing" | "delivered" | "cancelled";

export type Order = {
  id: string;
  outlet: string;
  items: number;
  units: number;
  amount: string;
  status: OrderStatus;
  time: string;
};

export type OrdersResponse = {
  filters: string[];
  orders: Order[];
};

export type DeliveryStopStatus = "done" | "active" | "next";

export type DeliveryStop = {
  id: number;
  time: string;
  outlet: string;
  area: string;
  units: number;
  status: DeliveryStopStatus;
  eta: string;
};

export type DeliveriesResponse = {
  routeId: string;
  totalUnits: number;
  activeStop: DeliveryStop | null;
  stops: DeliveryStop[];
};

export type ReportBar = {
  day: string;
  value: number;
  highlight?: boolean;
};

export type ProductKind = "pill" | "liquid" | "syringe" | "tablets";

export type ReportProduct = {
  name: string;
  category: string;
  units: number;
  trend: number;
  kind: ProductKind;
};

export type ReportsResponse = {
  period: string;
  revenue: string;
  revenueTrend: number;
  unitsSold: number;
  unitsSoldTrend: number;
  bars: ReportBar[];
  topProducts: ReportProduct[];
};

export type DistributionProduct = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  kind: ProductKind;
  color: string;
};

export type DistributionDraftResponse = {
  outletId: string | null;
  outletName: string;
  vehicleId: string | null;
  dateLabel: string;
  dateValue: string;
  vehicleName: string;
  driverName: string;
  deliveryFee: number;
  products: DistributionProduct[];
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: User;
};

export type SessionRecord = {
  token: string;
  userId: string;
  createdAt: string;
};

export type DistributionCreateRequest = {
  outletId?: string | null;
  outletName: string;
  vehicleId?: string | null;
  vehicleName: string;
  dateValue: string;
  products: Array<{
    id: string;
    quantity: number;
  }>;
};

export type DistributionCreateResponse = {
  distributionId: string;
  outletName: string;
  vehicleName: string;
  units: number;
  total: string;
  eta: string;
  status: "scheduled";
};

export type SubmittedDistributionRecord = DistributionCreateResponse & {
  createdAt: string;
  dateValue: string;
  deliveryFee: number;
  items: number;
  products: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
};

export type PersistedDatabase = {
  users: PersistedUser[];
  sessions: SessionRecord[];
  dashboard: StoredDashboardData;
  orders: OrdersResponse;
  deliveries: DeliveriesResponse;
  reports: ReportsResponse;
  distributionDraft: DistributionDraftResponse;
  submittedDistributions: SubmittedDistributionRecord[];
};
