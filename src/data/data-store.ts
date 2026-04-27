import type {
  DashboardResponse,
  DeliveriesResponse,
  DistributionCreateRequest,
  DistributionCreateResponse,
  LoginResponse,
  OrdersResponse,
  ReportsResponse,
  User,
} from "../types.js";

export interface DataStore {
  authenticate(email: string, password: string): Promise<LoginResponse | null>;
  getUserForToken(token: string): Promise<User | null>;
  getDashboard(user: User): Promise<DashboardResponse>;
  getOrders(): Promise<OrdersResponse>;
  getDeliveries(): Promise<DeliveriesResponse>;
  getReports(): Promise<ReportsResponse>;
  getDistributionDraft(): Promise<import("../types.js").DistributionDraftResponse>;
  createDistribution(input: DistributionCreateRequest): Promise<DistributionCreateResponse>;
}
