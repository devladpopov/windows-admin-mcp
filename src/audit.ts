import { appendFileSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { getConfig } from "./config.js";

export interface AuditEntry {
  timestamp: string;
  tool: string;
  params: Record<string, unknown>;
  result: "success" | "error" | "blocked" | "pending_confirmation";
  message?: string;
  durationMs?: number;
}

function getAuditPath(): string {
  const config = getConfig();
  return resolve(config.audit.path);
}

function isWithinSizeLimit(): boolean {
  const config = getConfig();
  const auditPath = getAuditPath();
  try {
    const stats = statSync(auditPath);
    return stats.size < config.audit.maxSizeMB * 1024 * 1024;
  } catch {
    return true; // File doesn't exist yet
  }
}

export function writeAuditLog(entry: AuditEntry): void {
  const config = getConfig();
  if (!config.audit.enabled) return;
  if (!isWithinSizeLimit()) return;

  const line = JSON.stringify(entry) + "\n";
  try {
    appendFileSync(getAuditPath(), line, "utf-8");
  } catch {
    // Audit log write failure is non-fatal
  }
}

/**
 * Convenience: log a tool call and return its result.
 */
export async function auditedCall<T>(
  tool: string,
  params: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    writeAuditLog({
      timestamp: new Date().toISOString(),
      tool,
      params,
      result: "success",
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeAuditLog({
      timestamp: new Date().toISOString(),
      tool,
      params,
      result: "error",
      message,
      durationMs: Date.now() - start,
    });
    throw err;
  }
}

/**
 * Read recent audit log entries (tail).
 */
export function readAuditLog(limit: number = 50): AuditEntry[] {
  const auditPath = getAuditPath();
  try {
    const content = readFileSync(auditPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries = lines.slice(-limit).map((line: string) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    });
    return entries.filter(Boolean);
  } catch {
    return [];
  }
}
