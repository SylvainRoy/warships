import pkg from "../package.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../src/shared/version.js";

describe("app version", () => {
  it("matches the package version and semantic version format", () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
