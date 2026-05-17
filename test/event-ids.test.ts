import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let EVENT_ID_DATABASE: typeof import("../src/data/event-ids.js").EVENT_ID_DATABASE;

describe("event-ids knowledge base", () => {
  before(async () => {
    const mod = await import("../src/data/event-ids.js");
    EVENT_ID_DATABASE = mod.EVENT_ID_DATABASE;
  });

  it("has entries", () => {
    assert.ok(EVENT_ID_DATABASE.length > 0);
  });

  it("each entry has required fields", () => {
    for (const entry of EVENT_ID_DATABASE) {
      assert.ok(typeof entry.id === "number", `Entry missing id`);
      assert.ok(typeof entry.source === "string", `Entry ${entry.id} missing source`);
      assert.ok(typeof entry.description === "string", `Entry ${entry.id} missing description`);
      assert.ok(Array.isArray(entry.commonCauses), `Entry ${entry.id} missing commonCauses`);
      assert.ok(entry.commonCauses.length > 0, `Entry ${entry.id} has empty commonCauses`);
      assert.ok(Array.isArray(entry.suggestedFixes), `Entry ${entry.id} missing suggestedFixes`);
      assert.ok(entry.suggestedFixes.length > 0, `Entry ${entry.id} has empty suggestedFixes`);
    }
  });

  it("contains key service crash events", () => {
    const ids = EVENT_ID_DATABASE.map((e) => e.id);
    assert.ok(ids.includes(7031), "Missing Event ID 7031 (service crash)");
    assert.ok(ids.includes(7034), "Missing Event ID 7034 (unexpected termination)");
    assert.ok(ids.includes(7036), "Missing Event ID 7036 (state change)");
  });

  it("contains security events", () => {
    const ids = EVENT_ID_DATABASE.map((e) => e.id);
    assert.ok(ids.includes(4624), "Missing Event ID 4624 (logon)");
    assert.ok(ids.includes(4625), "Missing Event ID 4625 (failed logon)");
  });

  it("has no duplicate id+source combos", () => {
    const seen = new Set<string>();
    for (const entry of EVENT_ID_DATABASE) {
      const key = `${entry.id}:${entry.source}`;
      assert.ok(!seen.has(key), `Duplicate entry: ${key}`);
      seen.add(key);
    }
  });
});
