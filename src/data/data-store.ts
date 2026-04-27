import type {
  DashboardResponse,
  DeliveriesResponse,
  DistributionCreateRequest,
  DistributionCreateResponse,
  LoginResponse,
  OrdersResponse,
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
  getUserForToken(token: string): Promise<User | null>;
  getDashboard(user: User): Promise<DashboardResponse>;
  getOrders(): Promise<OrdersResponse>;
  getDeliveries(): Promise<DeliveriesResponse>;
  getReports(): Promise<ReportsResponse>;
  getDistributionDraft(): Promise<import("../types.js").DistributionDraftResponse>;
  createDistribution(input: DistributionCreateRequest): Promise<DistributionCreateResponse>;
  createOutlet(input: SetupOutletRequest): Promise<SetupOutletResponse>;
  createVehicle(input: SetupVehicleRequest): Promise<SetupVehicleResponse>;
  createProduct(input: SetupProductRequest): Promise<SetupProductResponse>;
}
