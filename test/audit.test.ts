import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

let writeAuditLog: typeof import("../src/audit.js").writeAuditLog;
let readAuditLog: typeof import("../src/audit.js").readAuditLog;
let auditedCall: typeof import("../src/audit.js").auditedCall;

const TEST_AUDIT_PATH = resolve("test-audit.jsonl");

describe("audit", () => {
  before(async () => {
    // Clean up any previous test file
    if (existsSync(TEST_AUDIT_PATH)) unlinkSync(TEST_AUDIT_PATH);

    // Load config with test audit path
    const { loadConfig } = await import("../src/config.js");
    process.env.WINDOWS_ADMIN_MCP_CONFIG = "/nonexistent/path/config.json";
    loadConfig();

    // Patch config to use test path
    const { getConfig } = await import("../src/config.js");
    getConfig().audit.path = TEST_AUDIT_PATH;

    const mod = await import("../src/audit.js");
    writeAuditLog = mod.writeAuditLog;
    readAuditLog = mod.readAuditLog;
    auditedCall = mod.auditedCall;
  });

  it("writeAuditLog creates file and writes entry", () => {
    writeAuditLog({
      timestamp: new Date().toISOString(),
      tool: "test_tool",
      params: { name: "test" },
      result: "success",
    });
    assert.ok(existsSync(TEST_AUDIT_PATH));
  });

  it("readAuditLog reads written entries", () => {
    const entries = readAuditLog(10);
    assert.ok(entries.length > 0);
    assert.equal(entries[entries.length - 1].tool, "test_tool");
  });

  it("auditedCall logs success", async () => {
    const result = await auditedCall("audited_test", { x: 1 }, async () => "ok");
    assert.equal(result, "ok");

    const entries = readAuditLog(10);
    const last = entries[entries.length - 1];
    assert.equal(last.tool, "audited_test");
    assert.equal(last.result, "success");
  });

  it("auditedCall logs error and rethrows", async () => {
    await assert.rejects(
      async () => {
        await auditedCall("audited_fail", {}, async () => {
          throw new Error("test error");
        });
      },
      { message: "test error" }
    );

    const entries = readAuditLog(10);
    const last = entries[entries.length - 1];
    assert.equal(last.tool, "audited_fail");
    assert.equal(last.result, "error");
    assert.ok(last.message?.includes("test error"));
  });

  // Cleanup
  it("cleanup test file", () => {
    if (existsSync(TEST_AUDIT_PATH)) unlinkSync(TEST_AUDIT_PATH);
  });
});
