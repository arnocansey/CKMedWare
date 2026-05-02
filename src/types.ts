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

export type DashboardAreaBucket = {
  area: string;
  units: number;
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
  areaBreakdown: DashboardAreaBucket[];
  expiryWatchlist: ExpiryItem[];
};

export type StoredDashboardData = Omit<DashboardResponse, "user">;

export type OrderStatus = "pending" | "processing" | "delivered" | "cancelled";

export type Order = {
  id: string;
  outlet: string;
  items: number;
  lineItems: OrderLineItem[];
  signature: string | null;
  units: number;
  amount: string;
  amountValue: number;
  status: OrderStatus;
  date: string;
  time: string;
};

export type OrderLineItem = {
  drugName: string;
  quantity: number;
  expiryDate: string;
  costPrice: number;
  batchNumber: string;
};

export type OrdersResponse = {
  filters: string[];
  orders: Order[];
};

export type PurchaseOrderStatus = "pending" | "received";

export type PurchaseOrderLineItem = {
  drugName: string;
  quantity: number;
  expiryDate: string;
  costPrice: number;
  batchNumber?: string | null;
};

export type PurchaseOrder = {
  id: string;
  orderNumber: string;
  supplier: string;
  status: PurchaseOrderStatus;
  items: number;
  units: number;
  total: string;
  totalValue: number;
  date: string;
  createdAt: string;
  updatedAt: string;
  lineItems: PurchaseOrderLineItem[];
};

export type PurchaseOrdersResponse = {
  filters: string[];
  orders: PurchaseOrder[];
};

export type PurchaseOrderCreateRequest = {
  supplierName: string;
  items: Array<{
    drugName: string;
    quantity: number;
    expiryDate: string;
    costPrice: number;
  }>;
};

export type DeliveryStopStatus = "done" | "active" | "next";

export type DeliveryStop = {
  stopId: string;
  id: number;
  time: string;
  outlet: string;
  area: string;
  outletPhone?: string | null;
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

export type InventoryItem = {
  id: string;
  drugName: string;
  quantity: number;
  expiryDate: string;
  costPrice: number;
  batchNumber: string;
  createdAt: string;
  updatedAt: string;
};

export type InventoryResponse = {
  items: InventoryItem[];
};

export type InventoryCreateRequest = {
  drugName: string;
  quantity: number;
  expiryDate: string;
  costPrice: number;
  category?: string;
  kind?: ProductKind;
};

export type InventoryUpdateRequest = {
  quantity?: number;
  expiryDate?: string;
  costPrice?: number;
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
  outletPhone?: string | null;
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

export type SignupRequest = {
  name: string;
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: User;
};

export type TokenRefreshResponse = LoginResponse;

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
  signature?: string;
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

export type SetupOutletRequest = {
  name: string;
  area: string;
  phone?: string;
};

export type SetupOutletResponse = {
  id: string;
  name: string;
  area: string;
  phone?: string | null;
};

export type Branch = SetupOutletResponse & {
  isActive: boolean;
};

export type BranchListResponse = {
  branches: Branch[];
};

export type BranchUpdateRequest = {
  name?: string;
  area?: string;
  isActive?: boolean;
};

export type SetupVehicleRequest = {
  name: string;
  registrationNumber: string;
  driverName: string;
  defaultDeliveryFee: number;
};

export type SetupVehicleResponse = {
  id: string;
  name: string;
  registrationNumber: string;
  driverName: string;
  defaultDeliveryFee: number;
};

export type Vehicle = SetupVehicleResponse & {
  isActive: boolean;
};

export type VehicleListResponse = {
  vehicles: Vehicle[];
};

export type SetupProductRequest = {
  name: string;
  category: string;
  kind: ProductKind;
  price: number;
};

export type SetupProductResponse = {
  id: string;
  name: string;
  category: string;
  kind: ProductKind;
  price: number;
  color: string;
};

export type SubmittedDistributionRecord = DistributionCreateResponse & {
  createdAt: string;
  dateValue: string;
  deliveryFee: number;
  deliveryStatus?: DeliveryStopStatus;
  signature?: string | null;
  items: number;
  products: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    expiryDate?: string;
    batchNumber?: string;
  }>;
  outletPhone?: string | null;
};

export type PersistedDatabase = {
  users: PersistedUser[];
  sessions: SessionRecord[];
  dashboard: StoredDashboardData;
  orders: OrdersResponse;
  deliveries: DeliveriesResponse;
  reports: ReportsResponse;
  inventory?: InventoryResponse;
  distributionDraft: DistributionDraftResponse;
  submittedDistributions: SubmittedDistributionRecord[];
};
