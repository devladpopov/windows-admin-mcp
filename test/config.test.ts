import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Dynamic import since it's ESM
let loadConfig: typeof import("../src/config.js").loadConfig;
let getConfig: typeof import("../src/config.js").getConfig;
let isBlocked: typeof import("../src/config.js").isBlocked;

describe("config", () => {
  before(async () => {
    const mod = await import("../src/config.js");
    loadConfig = mod.loadConfig;
    getConfig = mod.getConfig;
    isBlocked = mod.isBlocked;
  });

  it("loadConfig returns default config when no file exists", () => {
    process.env.WINDOWS_ADMIN_MCP_CONFIG = "/nonexistent/path/config.json";
    const config = loadConfig();
    assert.equal(config.modules.services, true);
    assert.equal(config.modules.observability, true);
    assert.equal(config.safety.requireConfirmation, true);
    assert.equal(config.limits.maxBulkOperations, 20);
    assert.equal(config.audit.enabled, true);
    delete process.env.WINDOWS_ADMIN_MCP_CONFIG;
  });

  it("getConfig returns last loaded config", () => {
    const config = getConfig();
    assert.ok(config.modules);
    assert.ok(config.safety);
    assert.ok(config.limits);
    assert.ok(config.audit);
  });

  it("default blocklist includes critical processes", () => {
    const config = getConfig();
    assert.ok(config.safety.blocklist.includes("lsass"));
    assert.ok(config.safety.blocklist.includes("csrss"));
    assert.ok(config.safety.blocklist.includes("svchost"));
  });

  it("isBlocked returns matched entry for blocked process", () => {
    loadConfig(); // ensure defaults
    const result = isBlocked("lsass");
    assert.ok(result !== null);
    assert.ok(result!.includes("lsass"));
  });

  it("isBlocked returns null for non-blocked process", () => {
    const result = isBlocked("notepad");
    assert.equal(result, null);
  });

  it("isBlocked is case-insensitive", () => {
    const result = isBlocked("LSASS");
    assert.ok(result !== null);
  });
});
