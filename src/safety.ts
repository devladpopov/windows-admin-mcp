import { randomUUID } from "node:crypto";
import { getConfig, isBlocked } from "./config.js";
import { writeAuditLog } from "./audit.js";

export interface PendingAction {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  preview: string;
  createdAt: number;
  execute: () => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;
}

const pendingActions = new Map<string, PendingAction>();

/**
 * Register a destructive action for confirmation.
 * Returns the pending action ID and preview text.
 */
export function requestConfirmation(
  tool: string,
  params: Record<string, unknown>,
  preview: string,
  execute: () => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>
): { confirmationId: string; preview: string } {
  // Clean up expired actions
  cleanupExpired();

  const id = randomUUID();
  pendingActions.set(id, {
    id,
    tool,
    params,
    preview,
    createdAt: Date.now(),
    execute,
  });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    tool,
    params,
    result: "pending_confirmation",
    message: `Confirmation required. ID: ${id}`,
  });

  return { confirmationId: id, preview };
}

/**
 * Execute a previously confirmed action.
 */
export async function confirmAction(
  id: string
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  cleanupExpired();

  const action = pendingActions.get(id);
  if (!action) {
    return {
      content: [
        {
          type: "text",
          text: `Confirmation ID '${id}' not found or expired. Destructive actions expire after ${Math.round(getConfig().safety.confirmationTimeoutMs / 60000)} minutes.`,
        },
      ],
      isError: true,
    };
  }

  pendingActions.delete(id);

  try {
    const result = await action.execute();
    writeAuditLog({
      timestamp: new Date().toISOString(),
      tool: action.tool,
      params: action.params,
      result: "success",
      message: "Confirmed and executed",
    });
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeAuditLog({
      timestamp: new Date().toISOString(),
      tool: action.tool,
      params: action.params,
      result: "error",
      message,
    });
    return {
      content: [{ type: "text", text: `Execution failed: ${message}` }],
      isError: true,
    };
  }
}

/**
 * List all pending confirmations.
 */
export function listPending(): PendingAction[] {
  cleanupExpired();
  return Array.from(pendingActions.values());
}

/**
 * Cancel a pending action.
 */
export function cancelPending(id: string): boolean {
  return pendingActions.delete(id);
}

function cleanupExpired(): void {
  const timeout = getConfig().safety.confirmationTimeoutMs;
  const now = Date.now();
  for (const [id, action] of pendingActions) {
    if (now - action.createdAt > timeout) {
      pendingActions.delete(id);
    }
  }
}

/**
 * Check if confirmation is required and the target is not blocked.
 * Returns null if action can proceed, or an error response if blocked.
 */
export function checkSafety(
  targetName: string
): { content: Array<{ type: "text"; text: string }>; isError: true } | null {
  const blocked = isBlocked(targetName);
  if (blocked) {
    writeAuditLog({
      timestamp: new Date().toISOString(),
      tool: "safety_check",
      params: { target: targetName },
      result: "blocked",
      message: `Blocked: ${blocked}`,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: `BLOCKED: '${targetName}' is protected by safety configuration (matched: ${blocked}). This action cannot be performed.`,
        },
      ],
      isError: true,
    };
  }
  return null;
}

/**
 * Determine if a destructive action needs confirmation.
 */
export function needsConfirmation(): boolean {
  return getConfig().safety.requireConfirmation;
}
