import { describe, expect, it } from "vitest";
import { isKnownCollectionStatus, normalizeCollectionStatus } from "@/lib/yebeck";
import { PLATFORM_FEE_RATE } from "@/lib/pricing";

describe("Yebeck status words", () => {
  it("treats every common paid word as paid, whatever the capital letters", () => {
    for (const word of ["successful", "Successful", "SUCCESS", "success", "Completed", "paid", "approved", "Settled", "SUCCEEDED"]) {
      expect(normalizeCollectionStatus(word), word).toBe("success");
    }
  });

  it("treats declined, cancelled, expired and reversed as failed", () => {
    for (const word of ["failed", "FAILED", "reversed", "Cancelled", "canceled", "declined", "rejected", "expired", "timed_out", "timed-out"]) {
      expect(normalizeCollectionStatus(word), word).toBe("failed");
    }
  });

  it("keeps waiting for anything else", () => {
    for (const word of ["pending", "processing", "initiated", "", "something new"]) {
      expect(normalizeCollectionStatus(word), word).toBe("pending");
    }
  });

  it("knows which words are expected, so a new one gets logged", () => {
    expect(isKnownCollectionStatus("pending")).toBe(true);
    expect(isKnownCollectionStatus("Successful")).toBe(true);
    expect(isKnownCollectionStatus("awaiting_pin_entry")).toBe(false);
  });
});

describe("pricing", () => {
  it("has no processing fee", () => {
    expect(PLATFORM_FEE_RATE).toBe(0);
  });
});
