import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("CKMedWare API integration", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "ckmedware-test-"));
    process.env.DATA_DIR = dataDir;
    delete process.env.DATABASE_URL;
    process.env.SESSION_TTL_DAYS = "30";
  });

  afterEach(() => {
    vi.resetModules();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.SESSION_TTL_DAYS;
  });

  async function createAuthenticatedClient() {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const signupResponse = await request(app).post("/api/auth/signup").send({
      name: "Test Admin",
      email: "admin@test.local",
      password: "secure123",
    });

    expect(signupResponse.status).toBe(201);
    const token = signupResponse.body.token as string;
    expect(token).toBeTruthy();

    return { app, token };
  }

  it("rejects protected routes without bearer token", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const response = await request(app).get("/api/inventory");
    expect(response.status).toBe(401);
  });

  it("creates inventory item and returns it from inventory list", async () => {
    const { app, token } = await createAuthenticatedClient();

    const createResponse = await request(app)
      .post("/api/inventory")
      .set("Authorization", `Bearer ${token}`)
      .send({
        drugName: "Paracetamol",
        quantity: 120,
        expiryDate: "2027-12-31",
        costPrice: 25,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.drugName).toBe("Paracetamol");

    const inventoryResponse = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${token}`);

    expect(inventoryResponse.status).toBe(200);
    expect(Array.isArray(inventoryResponse.body.items)).toBe(true);
    expect(
      inventoryResponse.body.items.some(
        (item: { drugName: string; quantity: number }) =>
          item.drugName === "Paracetamol" && item.quantity === 120,
      ),
    ).toBe(true);
  });

  it("refreshes and revokes token sessions", async () => {
    const { app, token } = await createAuthenticatedClient();

    const refreshResponse = await request(app)
      .post("/api/auth/refresh")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.token).toBeTruthy();
    expect(refreshResponse.body.token).not.toBe(token);

    const oldTokenAccess = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${token}`);
    expect(oldTokenAccess.status).toBe(401);

    const newToken = refreshResponse.body.token as string;
    const newTokenAccess = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${newToken}`);
    expect(newTokenAccess.status).toBe(200);

    const logoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${newToken}`)
      .send({});
    expect(logoutResponse.status).toBe(204);

    const afterLogout = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${newToken}`);
    expect(afterLogout.status).toBe(401);
  });

  it("creates distribution and deducts stock from inventory", async () => {
    const { app, token } = await createAuthenticatedClient();

    await request(app)
      .post("/api/setup/outlets")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Ashongman Branch", area: "Ashongman" })
      .expect(201);

    await request(app)
      .post("/api/setup/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Van 1",
        registrationNumber: "GR-1001-26",
        driverName: "Driver A",
        defaultDeliveryFee: 20,
      })
      .expect(201);

    await request(app)
      .post("/api/inventory")
      .set("Authorization", `Bearer ${token}`)
      .send({
        drugName: "Amoxicillin",
        quantity: 100,
        expiryDate: "2027-11-30",
        costPrice: 40,
      })
      .expect(201);

    const draftResponse = await request(app)
      .get("/api/distributions/new")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const productId = draftResponse.body.products.find(
      (product: { name: string; id: string }) => product.name === "Amoxicillin",
    )?.id;
    expect(productId).toBeTruthy();

    await request(app)
      .post("/api/distributions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        outletName: "Ashongman Branch",
        vehicleName: "Van 1",
        dateValue: "2027-01-10",
        products: [{ id: productId, quantity: 30 }],
      })
      .expect(201);

    const inventoryResponse = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const amoxicillin = inventoryResponse.body.items.find(
      (item: { drugName: string }) => item.drugName === "Amoxicillin",
    );
    expect(amoxicillin.quantity).toBe(70);
  });
});
