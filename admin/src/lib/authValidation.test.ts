import { describe, expect, it } from "vitest";
import {
  EMAIL_REGEX,
  PASSWORD_REGEX,
  isValidEmail,
  isValidPassword,
  passwordsMatch,
  passwordValidationError,
} from "./authValidation";

describe("email validation", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("admin@palsafar.com")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("nope@")).toBe(false);
    expect(isValidEmail("nope@site")).toBe(false);
  });

  it("trims surrounding whitespace before testing", () => {
    expect(isValidEmail("  admin@palsafar.com  ")).toBe(true);
  });

  it("keeps the legacy inline regex contract", () => {
    expect(EMAIL_REGEX.test("a@b.co")).toBe(true);
    expect(EMAIL_REGEX.test("not-an-email")).toBe(false);
  });
});

describe("password policy (preserved)", () => {
  it("accepts a compliant password", () => {
    expect(isValidPassword("Admin@123")).toBe(true);
  });

  it("rejects passwords missing each required character class", () => {
    expect(isValidPassword("admin@123")).toBe(false); // no uppercase
    expect(isValidPassword("ADMIN@123")).toBe(false); // no lowercase
    expect(isValidPassword("Admin@abc")).toBe(false); // no digit
    expect(isValidPassword("Admin1234")).toBe(false); // no special
  });

  it("enforces length bounds", () => {
    expect(isValidPassword("Ab1@234")).toBe(false); // 7 chars
    expect(isValidPassword("A".repeat(129))).toBe(false);
  });

  it("keeps the legacy password regex matching the frontend policy", () => {
    expect(PASSWORD_REGEX.test("NewPass@123")).toBe(true);
    expect(PASSWORD_REGEX.test("weakpass")).toBe(false);
  });
});

describe("confirm-password guard", () => {
  it("accepts identical non-empty values", () => {
    expect(passwordsMatch("NewPass@123", "NewPass@123")).toBe(true);
  });

  it("rejects a mismatch", () => {
    expect(passwordsMatch("NewPass@123", "NewPass@124")).toBe(false);
  });

  it("rejects empty confirm (even with identical visual value)", () => {
    expect(passwordsMatch("NewPass@123", "")).toBe(false);
  });
});

describe("passwordValidationError", () => {
  it("returns empty for a compliant password", () => {
    expect(passwordValidationError("NewPass@123")).toBe("");
  });

  it("flags an empty value", () => {
    expect(passwordValidationError("")).toBe("Enter a new password");
  });

  it("flags a policy violation with the exact UI message", () => {
    expect(passwordValidationError("short")).toBe(
      "Password must be 8+ chars with uppercase, lowercase, number, and special character (@$!%*?&)",
    );
  });
});