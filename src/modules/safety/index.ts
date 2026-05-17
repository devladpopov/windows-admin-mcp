import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig, loadConfig } from "../../config.js";
import { readAuditLog } from "../../audit.js";
import { confirmAction, listPending, cancelPending } from "../../safety.js";

export function registerSafetyModule(server: McpServer) {
  // ── Tool 1: config_get ─────────────────────────────────────────────────
  server.tool(
    "config_get",
    "Get the current safety and audit configuration for windows-admin-mcp.",
    {},
    async () => {
      const config = getConfig();
      return { content: [{ type: "text" as const, text: JSON.stringify(config, null, 2) }] };
    }
  );

  // ── Tool 2: config_reload ──────────────────────────────────────────────
  server.tool(
    "config_reload",
    "Reload configuration from config.json file. Use after editing the config file.",
    {},
    async () => {
      const config = loadConfig();
      return {
        content: [
          {
            type: "text" as const,
            text: `Configuration reloaded.\n${JSON.stringify(config, null, 2)}`,
          },
        ],
      };
    }
  );

  // ── Tool 3: confirm_action ─────────────────────────────────────────────
  server.tool(
    "confirm_action",
    "Confirm a pending destructive action. When safety.requireConfirmation is enabled, destructive operations (kill, stop, delete, bulk) return a confirmationId instead of executing immediately. Call this tool with that ID to proceed.",
    {
      confirmationId: z.string().describe("The confirmation ID returned by the destructive action"),
    },
    async ({ confirmationId }) => {
      return await confirmAction(confirmationId);
    }
  );

  // ── Tool 4: pending_actions ────────────────────────────────────────────
  server.tool(
    "pending_actions",
    "List all pending destructive actions awaiting confirmation.",
    {},
    async () => {
      const pending = listPending();
      if (pending.length === 0) {
        return { content: [{ type: "text" as const, text: "No pending actions." }] };
      }

      const summary = pending.map((p) => ({
        confirmationId: p.id,
        tool: p.tool,
        params: p.params,
        preview: p.preview,
        expiresIn: `${Math.round((getConfig().safety.confirmationTimeoutMs - (Date.now() - p.createdAt)) / 1000)}s`,
      }));

      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  // ── Tool 5: cancel_action ──────────────────────────────────────────────
  server.tool(
    "cancel_action",
    "Cancel a pending destructive action.",
    {
      confirmationId: z.string().describe("The confirmation ID to cancel"),
    },
    async ({ confirmationId }) => {
      const cancelled = cancelPending(confirmationId);
      if (cancelled) {
        return { content: [{ type: "text" as const, text: `Action ${confirmationId} cancelled.` }] };
      }
      return {
        content: [{ type: "text" as const, text: `Action ${confirmationId} not found or already expired.` }],
        isError: true,
      };
    }
  );

  // ── Tool 6: audit_query ────────────────────────────────────────────────
  server.tool(
    "audit_query",
    "Query the audit log. Returns recent operations performed through the MCP server.",
    {
      limit: z.number().min(1).max(200).default(50).describe("Number of recent entries to return"),
      tool: z.string().optional().describe("Filter by tool name"),
      result: z
        .enum(["success", "error", "blocked", "pending_confirmation"])
        .optional()
        .describe("Filter by result type"),
    },
    async ({ limit, tool, result }) => {
      let entries = readAuditLog(limit);

      if (tool) {
        entries = entries.filter((e) => e.tool === tool);
      }
      if (result) {
        entries = entries.filter((e) => e.result === result);
      }

      if (entries.length === 0) {
        return { content: [{ type: "text" as const, text: "No audit log entries found." }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }] };
    }
  );
}
