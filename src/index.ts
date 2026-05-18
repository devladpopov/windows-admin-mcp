#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerServicesModule } from "./modules/services/index.js";
import { registerEventsModule } from "./modules/events/index.js";
import { registerSchedulerModule } from "./modules/scheduler/index.js";
import { registerProcessesModule } from "./modules/processes/index.js";
import { registerNetworkModule } from "./modules/network/index.js";
import { registerDiagnosticsModule } from "./modules/diagnostics/index.js";
import { registerSafetyModule } from "./modules/safety/index.js";
import { registerObservabilityModule } from "./modules/observability/index.js";
import { registerResources } from "./resources.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const VERSION = "1.1.0";

if (process.platform !== "win32") {
  console.error("windows-admin-mcp only runs on Windows.");
  process.exit(1);
}

// ── Setup wizard (defined before use) ──────────────────────────────────

interface ClientInfo {
  name: string;
  key: string;
  configPath: string;
  exists: boolean;
  configured: boolean;
}

const MCP_ENTRY = {
  command: "npx",
  args: ["-y", "windows-admin-mcp"],
};

function detectClients(): ClientInfo[] {
  const appdata = process.env.APPDATA || "";
  const home = process.env.USERPROFILE || "";

  const clients: Omit<ClientInfo, "exists" | "configured">[] = [
    {
      name: "Claude Desktop",
      key: "claudeDesktop",
      configPath: join(appdata, "Claude", "claude_desktop_config.json"),
    },
    {
      name: "Cursor",
      key: "cursor",
      configPath: join(home, ".cursor", "mcp.json"),
    },
    {
      name: "VS Code",
      key: "vscode",
      configPath: join(home, ".vscode", "mcp.json"),
    },
    {
      name: "Windsurf",
      key: "windsurf",
      configPath: join(home, ".codeium", "windsurf", "mcp_config.json"),
    },
    {
      name: "Claude Code",
      key: "claudeCode",
      configPath: join(home, ".claude.json"),
    },
  ];

  return clients.map((c) => {
    const exists = existsSync(c.configPath);
    let configured = false;
    if (exists) {
      try {
        const content = readFileSync(c.configPath, "utf-8");
        configured = content.includes("windows-admin-mcp");
      } catch {}
    }
    return { ...c, exists, configured };
  });
}

function addToConfig(client: ClientInfo): { ok: boolean; message: string } {
  try {
    let cfg: Record<string, unknown> = {};
    if (existsSync(client.configPath)) {
      const raw = readFileSync(client.configPath, "utf-8");
      cfg = JSON.parse(raw);
    }

    if (client.key === "claudeDesktop" || client.key === "claudeCode") {
      const servers = (cfg.mcpServers as Record<string, unknown>) || {};
      servers["windows-admin"] = MCP_ENTRY;
      cfg.mcpServers = servers;
    } else {
      // Cursor, VS Code, Windsurf
      const servers = (cfg.servers as Record<string, unknown>)
        || (cfg.mcpServers as Record<string, unknown>)
        || {};
      servers["windows-admin"] = MCP_ENTRY;
      if (cfg.servers) {
        cfg.servers = servers;
      } else {
        cfg.mcpServers = servers;
      }
    }

    const dir = client.configPath.replace(/[/\\][^/\\]+$/, "");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(client.configPath, JSON.stringify(cfg, null, 2), "utf-8");
    return { ok: true, message: `Configured ${client.name}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Failed to configure ${client.name}: ${msg}` };
  }
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runSetup() {
  console.log(`windows-admin-mcp v${VERSION} — Setup`);
  console.log(``);

  const clients = detectClients();
  const detected = clients.filter((c) => c.exists);
  const alreadyConfigured = clients.filter((c) => c.configured);

  console.log(`Detected MCP clients on this machine:`);
  console.log(``);
  for (const c of clients) {
    const marker = c.configured ? "[OK]" : c.exists ? "[ ]" : " - ";
    const suffix = c.configured ? " (already configured)" : c.exists ? "" : " (not installed)";
    console.log(`  ${marker} ${c.name}${suffix}`);
  }
  console.log(``);

  const needSetup = detected.filter((c) => !c.configured);

  if (needSetup.length === 0 && alreadyConfigured.length > 0) {
    console.log(`All detected clients are already configured. You're good to go!`);
    console.log(`Restart your MCP client to load the tools.`);
    return;
  }

  if (detected.length === 0) {
    console.log(`No MCP clients detected.`);
    console.log(``);
    console.log(`Install one of these:`);
    console.log(`  - Claude Desktop: https://claude.ai/download`);
    console.log(`  - Cursor:         https://cursor.com`);
    console.log(`  - VS Code:        https://code.visualstudio.com (with MCP extension)`);
    console.log(`  - Claude Code:    npm install -g @anthropic-ai/claude-code`);
    console.log(``);
    console.log(`Then run this setup again: npx windows-admin-mcp --setup`);
    return;
  }

  if (needSetup.length === 1) {
    const client = needSetup[0];
    const answer = await ask(`Configure ${client.name}? (Y/n) `);
    if (answer.toLowerCase() === "n") {
      console.log(`Skipped. You can run --setup again later.`);
      return;
    }
    const result = addToConfig(client);
    console.log(`  ${result.ok ? "[OK]" : "[!!]"} ${result.message}`);
  } else {
    console.log(`Which clients to configure?`);
    console.log(``);
    for (let i = 0; i < needSetup.length; i++) {
      console.log(`  ${i + 1}. ${needSetup[i].name}`);
    }
    console.log(`  A. All (${needSetup.length} clients)`);
    console.log(`  S. Skip`);
    console.log(``);
    const answer = await ask(`Choose [A]: `);

    if (answer.toLowerCase() === "s") {
      console.log(`Skipped.`);
      return;
    }

    let toSetup: ClientInfo[];
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= needSetup.length) {
      toSetup = [needSetup[num - 1]];
    } else {
      toSetup = needSetup; // default: all
    }

    for (const client of toSetup) {
      const result = addToConfig(client);
      console.log(`  ${result.ok ? "[OK]" : "[!!]"} ${result.message}`);
    }
  }

  console.log(``);
  console.log(`Done! Restart your MCP client to load ${VERSION} (42 tools).`);
}

// ── Route: --setup or MCP server ───────────────────────────────────────

if (process.argv.includes("--setup")) {
  await runSetup();
  process.exit(0);
}

// ── Normal MCP server mode ─────────────────────────────────────────────

const config = loadConfig();

const enabledModules = Object.entries(config.modules).filter(([, v]) => v).length;
const toolCounts: Record<string, number> = {
  services: 6, events: 5, scheduler: 8, processes: 4,
  network: 4, diagnostics: 4, safety: 6, observability: 5,
};
const totalTools = Object.entries(config.modules)
  .filter(([, v]) => v)
  .reduce((sum, [k]) => sum + (toolCounts[k] || 0), 0);

const isInteractive = process.stdin.isTTY === true;

if (isInteractive) {
  console.log(`windows-admin-mcp v${VERSION}`);
  console.log(`${totalTools} tools, ${enabledModules} modules, 3 resources`);
  console.log(``);
  console.log(`This is an MCP server. It needs an MCP client to work.`);
  console.log(`Run setup to configure your client automatically:`);
  console.log(``);
  console.log(`  npx windows-admin-mcp --setup`);
  console.log(``);
  console.log(`Supported clients: Claude Desktop, Cursor, VS Code, Windsurf, Claude Code`);
  process.exit(0);
} else {
  console.error(`windows-admin-mcp v${VERSION} | ${totalTools} tools ready`);
}

const server = new McpServer({
  name: "windows-admin-mcp",
  version: VERSION,
});

if (config.modules.services) registerServicesModule(server);
if (config.modules.events) registerEventsModule(server);
if (config.modules.scheduler) registerSchedulerModule(server);
if (config.modules.processes) registerProcessesModule(server);
if (config.modules.network) registerNetworkModule(server);
if (config.modules.diagnostics) registerDiagnosticsModule(server);
if (config.modules.safety) registerSafetyModule(server);
if (config.modules.observability) registerObservabilityModule(server);

registerResources(server);

const transport = new StdioServerTransport();
await server.connect(transport).catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
