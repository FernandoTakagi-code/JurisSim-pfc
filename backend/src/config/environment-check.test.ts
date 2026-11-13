import { describe, expect, it } from "vitest";
import {
  checkBackendEnvironment,
  checkFrontendEnvironment,
} from "./environment-check";

const base = () => ({
  DATABASE_URL: "postgresql://test:test@db.example.test:5432/demo",
  DIRECT_URL: "postgresql://test:test@db.example.test:5432/demo",
  JWT_SECRET: "private-test-value-that-must-never-be-reported",
  APP_PUBLIC_URL: "https://frontend.example.test",
  CORS_ORIGINS: "https://frontend.example.test",
});
describe("environment configuration without credential disclosure", () => {
  it("accepts runtime variables without an env file and warns about optional email", () => {
    const result = checkBackendEnvironment(base(), true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
  it.each(["DATABASE_URL", "DIRECT_URL", "JWT_SECRET", "APP_PUBLIC_URL"])(
    "rejects missing %s",
    (key) => {
      expect(
        checkBackendEnvironment({ ...base(), [key]: "" }, true).errors.join(
          " ",
        ),
      ).toContain(key);
    },
  );
  it("rejects placeholders, bad ports and API/schema inconsistencies without printing input", () => {
    const values = {
      ...base(),
      DATABASE_URL:
        "postgresql://USER:PASSWORD@SUPABASE_POOLER_HOST:6543/postgres",
      PORT: "99999",
      QUESTION_REVIEW_API_ENABLED: "true",
    };
    const result = checkBackendEnvironment(values);
    expect(result.errors).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain(values.DATABASE_URL);
    expect(JSON.stringify(result)).not.toContain(values.JWT_SECRET);
  });
  it("rejects a malformed URL containing sensitive text without disclosing it", () => {
    const canary = "secret-private-credential-canary";
    const result = checkBackendEnvironment({
      ...base(),
      DIRECT_URL: canary,
      APP_PUBLIC_URL: canary,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain(canary);
  });
  it("rejects localhost, HTTP, missing CORS and local-only features for production", () => {
    const result = checkBackendEnvironment(
      {
        ...base(),
        APP_PUBLIC_URL: "http://localhost:5173",
        CORS_ORIGINS: "",
        SEED_LOCAL_DATABASE: "true",
      },
      true,
    );
    expect(result.errors).toHaveLength(3);
  });
  it("accepts local HTTP and requires an exact matching CORS origin", () => {
    expect(
      checkBackendEnvironment({
        ...base(),
        APP_PUBLIC_URL: "http://localhost:5173",
        CORS_ORIGINS: "http://localhost:5173",
      }).errors,
    ).toEqual([]);
    expect(
      checkBackendEnvironment({
        ...base(),
        CORS_ORIGINS: "https://other.example.test",
      }).errors.join(" "),
    ).toContain("CORS_ORIGINS");
  });
  it("validates pilot dependencies and strict flag values", () => {
    const result = checkBackendEnvironment({
      ...base(),
      INITIAL_DIAGNOSTIC_REQUIRED: "true",
      INITIAL_DIAGNOSTIC_PILOT_ENABLED: "true",
      QUESTION_REVIEW_API_ENABLED: "yes",
    });
    expect(result.errors).toHaveLength(3);
  });
  it("validates public frontend values and rejects exposed credentials", () => {
    const values = {
      VITE_API_URL: "https://api.example.test",
      VITE_JWT_SECRET: "sensitive-canary",
    };
    expect(checkFrontendEnvironment(values, true).errors).toHaveLength(1);
    expect(
      JSON.stringify(checkFrontendEnvironment(values, true)),
    ).not.toContain("sensitive-canary");
    expect(
      checkFrontendEnvironment(
        {
          VITE_API_URL: "https://api.example.test",
          VITE_GOOGLE_CLIENT_ID: "public-client-id",
        },
        true,
      ).errors,
    ).toEqual([]);
  });
  it("rejects credentialed URLs and development frontend values in production", () => {
    for (const url of [
      "http://localhost:3333",
      "https://user:password@api.example.test",
      "file:///tmp/api",
    ])
      expect(
        checkFrontendEnvironment({ VITE_API_URL: url }, true).errors,
      ).toHaveLength(1);
    expect(
      checkFrontendEnvironment(
        {
          VITE_API_URL: "https://api.example.test",
          VITE_JURISSIM_DEMO_MODE: "true",
        },
        true,
      ).errors,
    ).toHaveLength(1);
  });
});
