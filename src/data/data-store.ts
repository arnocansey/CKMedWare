import type {
  BranchListResponse,
  BranchUpdateRequest,
  DashboardResponse,
  DeliveriesResponse,
  DistributionCreateRequest,
  DistributionCreateResponse,
  InventoryCreateRequest,
  InventoryUpdateRequest,
  InventoryResponse,
  LoginResponse,
  OrdersResponse,
  PurchaseOrder,
  PurchaseOrderCreateRequest,
  PurchaseOrdersResponse,
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

export interface DataStore {
  authenticate(email: string, password: string): Promise<LoginResponse | null>;
  signup(input: SignupRequest): Promise<LoginResponse>;
  refreshSession(token: string): Promise<LoginResponse | null>;
  revokeSession(token: string): Promise<void>;
  getUserForToken(token: string): Promise<User | null>;
  getDashboard(user: User): Promise<DashboardResponse>;
  getOrders(): Promise<OrdersResponse>;
  getPurchaseOrders(options?: { q?: string; page?: number; limit?: number }): Promise<PurchaseOrdersResponse>;
  createPurchaseOrder(input: PurchaseOrderCreateRequest): Promise<PurchaseOrder>;
  receivePurchaseOrder(id: string): Promise<PurchaseOrder>;
  getDeliveries(): Promise<DeliveriesResponse>;
  startDeliveryStop(id: string): Promise<DeliveriesResponse>;
  completeDeliveryStop(id: string): Promise<DeliveriesResponse>;
  getReports(): Promise<ReportsResponse>;
  getInventory(options?: { q?: string; page?: number; limit?: number }): Promise<InventoryResponse>;
  listBranches(): Promise<BranchListResponse>;
  updateBranch(id: string, input: BranchUpdateRequest): Promise<import("../types.js").Branch>;
  getDistributionDraft(): Promise<import("../types.js").DistributionDraftResponse>;
  createDistribution(input: DistributionCreateRequest): Promise<DistributionCreateResponse>;
  createInventoryItem(input: InventoryCreateRequest): Promise<import("../types.js").InventoryItem>;
  updateInventoryItem(id: string, input: InventoryUpdateRequest): Promise<import("../types.js").InventoryItem>;
  deleteInventoryItem(id: string): Promise<void>;
  createOutlet(input: SetupOutletRequest): Promise<SetupOutletResponse>;
  createVehicle(input: SetupVehicleRequest): Promise<SetupVehicleResponse>;
  createProduct(input: SetupProductRequest): Promise<SetupProductResponse>;
}
