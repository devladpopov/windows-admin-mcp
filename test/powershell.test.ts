import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let escapePsString: typeof import("../src/utils/powershell.js").escapePsString;
let runPowerShell: typeof import("../src/utils/powershell.js").runPowerShell;
let runPowerShellJson: typeof import("../src/utils/powershell.js").runPowerShellJson;
let runPowerShellChecked: typeof import("../src/utils/powershell.js").runPowerShellChecked;

describe("powershell utilities", () => {
  before(async () => {
    const mod = await import("../src/utils/powershell.js");
    escapePsString = mod.escapePsString;
    runPowerShell = mod.runPowerShell;
    runPowerShellJson = mod.runPowerShellJson;
    runPowerShellChecked = mod.runPowerShellChecked;
  });

  describe("escapePsString", () => {
    it("returns string unchanged when no quotes", () => {
      assert.equal(escapePsString("hello"), "hello");
    });

    it("doubles single quotes", () => {
      assert.equal(escapePsString("it's"), "it''s");
    });

    it("handles multiple quotes", () => {
      assert.equal(escapePsString("a'b'c"), "a''b''c");
    });

    it("handles empty string", () => {
      assert.equal(escapePsString(""), "");
    });

    it("doesn't modify double quotes", () => {
      assert.equal(escapePsString('say "hi"'), 'say "hi"');
    });

    it("handles injection attempt", () => {
      const malicious = "'; Remove-Item C:\\; '";
      const escaped = escapePsString(malicious);
      // 2 single quotes in input, each doubled to ''
      assert.equal(escaped, "''; Remove-Item C:\\; ''");
    });
  });

  // These tests only run on Windows
  if (process.platform === "win32") {
    describe("runPowerShell", () => {
      it("executes simple command", async () => {
        const result = await runPowerShell("Write-Output 'hello'");
        assert.equal(result.stdout, "hello");
        assert.equal(result.stderr, "");
      });

      it("returns stderr for errors", async () => {
        const result = await runPowerShell("Write-Error 'test error' 2>&1; Write-Output 'ok'");
        assert.ok(result.stdout.includes("ok") || result.stderr.length > 0);
      });
    });

    describe("runPowerShellJson", () => {
      it("parses JSON output", async () => {
        const result = await runPowerShellJson<{ Name: string }>(
          "@{Name='test'}"
        );
        assert.equal(result.Name, "test");
      });

      it("returns null for empty output", async () => {
        const result = await runPowerShellJson("$null");
        assert.equal(result, null);
      });
    });

    describe("runPowerShellChecked", () => {
      it("returns stdout on success", async () => {
        const result = await runPowerShellChecked("Write-Output 'ok'");
        assert.equal(result, "ok");
      });
    });
  }
});
