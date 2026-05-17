import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface SafetyConfig {
  requireConfirmation: boolean;
  confirmationTimeoutMs: number;
  blocklist: string[];
  allowlist: string[];
}

export interface LimitsConfig {
  maxProcessesToKill: number;
  maxEventsToReturn: number;
  maxBulkOperations: number;
}

export interface AuditConfig {
  enabled: boolean;
  path: string;
  maxSizeMB: number;
}

export interface ModulesConfig {
  services: boolean;
  events: boolean;
  scheduler: boolean;
  processes: boolean;
  network: boolean;
  diagnostics: boolean;
  safety: boolean;
  observability: boolean;
}

export interface AppConfig {
  modules: ModulesConfig;
  safety: SafetyConfig;
  limits: LimitsConfig;
  audit: AuditConfig;
}

const DEFAULT_CONFIG: AppConfig = {
  modules: {
    services: true,
    events: true,
    scheduler: true,
    processes: true,
    network: true,
    diagnostics: true,
    safety: true,
    observability: true,
  },
  safety: {
    requireConfirmation: true,
    confirmationTimeoutMs: 300_000, // 5 minutes
    blocklist: [
      "TrustedInstaller",
      "lsass",
      "csrss",
      "wininit",
      "smss",
      "services",
      "winlogon",
      "svchost",
    ],
    allowlist: [],
  },
  limits: {
    maxProcessesToKill: 5,
    maxEventsToReturn: 500,
    maxBulkOperations: 20,
  },
  audit: {
    enabled: true,
    path: "./windows-admin-mcp-audit.jsonl",
    maxSizeMB: 50,
  },
};

let currentConfig: AppConfig = structuredClone(DEFAULT_CONFIG);

function resolveConfigPath(): string {
  const envPath = process.env.WINDOWS_ADMIN_MCP_CONFIG;
  if (envPath) return resolve(envPath);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  return resolve(__dirname, "..", "config.json");
}

export function loadConfig(): AppConfig {
  const configPath = resolveConfigPath();

  if (!existsSync(configPath)) {
    currentConfig = structuredClone(DEFAULT_CONFIG);
    return currentConfig;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    currentConfig = mergeDeep(structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>, parsed) as unknown as AppConfig;
  } catch {
    currentConfig = structuredClone(DEFAULT_CONFIG);
  }

  return currentConfig;
}

export function getConfig(): AppConfig {
  return currentConfig;
}

function mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      target[key] = mergeDeep(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Check if a target name is blocked by the blocklist.
 * Returns the matched blocklist entry or null if allowed.
 */
export function isBlocked(name: string): string | null {
  const config = getConfig();
  const lower = name.toLowerCase();

  // If allowlist is non-empty, only allowed names pass
  if (config.safety.allowlist.length > 0) {
    const allowed = config.safety.allowlist.some(
      (a) => lower === a.toLowerCase() || matchWildcard(lower, a.toLowerCase())
    );
    if (allowed) return null;
    return `'${name}' is not in the allowlist`;
  }

  // Check blocklist
  for (const blocked of config.safety.blocklist) {
    if (lower === blocked.toLowerCase() || matchWildcard(lower, blocked.toLowerCase())) {
      return blocked;
    }
  }

  return null;
}

function matchWildcard(str: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return regex.test(str);
}
