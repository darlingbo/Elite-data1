import { describe, it, expect } from "vitest";
import {
  isValidGhanaPhone,
  normalizePhone,
} from "@/lib/validation";

describe("Ghana phone validation", () => {
  it("accepts valid MTN/Telecel/AirtelTigo numbers", () => {
    expect(isValidGhanaPhone("0241234567")).toBe(true); // MTN
    expect(isValidGhanaPhone("0201234567")).toBe(true); // Telecel/Voda
    expect(isValidGhanaPhone("0501234567")).toBe(true); // Telecel
    expect(isValidGhanaPhone("0271234567")).toBe(true); // AirtelTigo
  });

  it("strips whitespace before validating", () => {
    expect(isValidGhanaPhone(" 024 123 4567 ")).toBe(true);
    expect(normalizePhone(" 024 123 4567 ")).toBe("0241234567");
  });

  it("rejects malformed numbers", () => {
    expect(isValidGhanaPhone("241234567")).toBe(false);   // no leading 0
    expect(isValidGhanaPhone("0141234567")).toBe(false);  // bad prefix (1)
    expect(isValidGhanaPhone("0611234567")).toBe(false);  // bad prefix (6)
    expect(isValidGhanaPhone("024123456")).toBe(false);   // too short
    expect(isValidGhanaPhone("02412345678")).toBe(false); // too long
    expect(isValidGhanaPhone("024123456x")).toBe(false);  // non-digit
    expect(isValidGhanaPhone("")).toBe(false);
  });
});
