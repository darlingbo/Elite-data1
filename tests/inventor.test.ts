import { afterEach, describe, expect, it, vi } from "vitest";
import { inventorPurchase, inventorVerifyNumber, inventorVoucher } from "@/lib/inventor";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Inventor API contract", () => {
  it("uses the documented purchase fields and captures Inventor's reference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { order: { reference: "api_abc123" }, currentBalance: 989.5 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await inventorPurchase("MTN", "0541234567", 1, "local-ref");

    expect(result).toMatchObject({ ok: true, reference: "api_abc123", balance: 989.5 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      network: "MTN",
      Phone: "0541234567",
      Datasize: 1,
      reference: "local-ref",
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toMatch(/^Bearer /);
  });

  it("does not accept a success body returned with an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: {} }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));

    await expect(inventorVoucher("BECE", "0541234567", 1)).resolves.toMatchObject({ ok: false });
  });

  it("surfaces the documented MTN eligibility message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: "Phone number not verified",
      message: "0541234567 is not added to our beneficiary list",
    }), { status: 400, headers: { "Content-Type": "application/json" } })));

    await expect(inventorVerifyNumber("0541234567")).resolves.toEqual({
      verified: false,
      error: "0541234567 is not added to our beneficiary list",
    });
  });
});
