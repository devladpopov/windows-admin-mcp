import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let requestConfirmation: typeof import("../src/safety.js").requestConfirmation;
let confirmAction: typeof import("../src/safety.js").confirmAction;
let listPending: typeof import("../src/safety.js").listPending;
let cancelPending: typeof import("../src/safety.js").cancelPending;
let needsConfirmation: typeof import("../src/safety.js").needsConfirmation;
let checkSafety: typeof import("../src/safety.js").checkSafety;

describe("safety", () => {
  before(async () => {
    // Ensure config is loaded first
    const { loadConfig } = await import("../src/config.js");
    process.env.WINDOWS_ADMIN_MCP_CONFIG = "/nonexistent/path/config.json";
    loadConfig();

    const mod = await import("../src/safety.js");
    requestConfirmation = mod.requestConfirmation;
    confirmAction = mod.confirmAction;
    listPending = mod.listPending;
    cancelPending = mod.cancelPending;
    needsConfirmation = mod.needsConfirmation;
    checkSafety = mod.checkSafety;
  });

  it("needsConfirmation returns true by default", () => {
    assert.equal(needsConfirmation(), true);
  });

  it("checkSafety blocks lsass", () => {
    const result = checkSafety("lsass");
    assert.ok(result !== null);
    assert.equal(result!.isError, true);
    assert.ok(result!.content[0].text.includes("BLOCKED"));
  });

  it("checkSafety allows notepad", () => {
    const result = checkSafety("notepad");
    assert.equal(result, null);
  });

  it("requestConfirmation stores pending action", () => {
    const { confirmationId } = requestConfirmation(
      "test_tool",
      { name: "test" },
      "Will do test action",
      async () => ({ content: [{ type: "text" as const, text: "done" }] })
    );
    assert.ok(confirmationId);
    assert.ok(confirmationId.length > 10);

    const pending = listPending();
    assert.ok(pending.length > 0);
    assert.ok(pending.some((p) => p.id === confirmationId));
  });

  it("confirmAction executes pending action", async () => {
    const { confirmationId } = requestConfirmation(
      "test_tool_2",
      { name: "test2" },
      "Will do test2",
      async () => ({ content: [{ type: "text" as const, text: "executed!" }] })
    );

    const result = await confirmAction(confirmationId);
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, "executed!");
  });

  it("confirmAction returns error for unknown ID", async () => {
    const result = await confirmAction("nonexistent-id-12345");
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("not found"));
  });

  it("cancelPending removes action", () => {
    const { confirmationId } = requestConfirmation(
      "test_cancel",
      {},
      "Will cancel",
      async () => ({ content: [{ type: "text" as const, text: "nope" }] })
    );
    const cancelled = cancelPending(confirmationId);
    assert.equal(cancelled, true);

    const pending = listPending();
    assert.ok(!pending.some((p) => p.id === confirmationId));
  });
});
