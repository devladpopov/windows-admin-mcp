#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, getConfig } from "./config.js";
import { registerServicesModule } from "./modules/services/index.js";
import { registerEventsModule } from "./modules/events/index.js";
import { registerSchedulerModule } from "./modules/scheduler/index.js";
import { registerProcessesModule } from "./modules/processes/index.js";
import { registerNetworkModule } from "./modules/network/index.js";
import { registerDiagnosticsModule } from "./modules/diagnostics/index.js";
import { registerSafetyModule } from "./modules/safety/index.js";
import { registerObservabilityModule } from "./modules/observability/index.js";
import { registerResources } from "./resources.js";

if (process.platform !== "win32") {
  console.error("windows-admin-mcp only runs on Windows.");
  process.exit(1);
}

// Load configuration (config.json next to dist/ or via WINDOWS_ADMIN_MCP_CONFIG env)
const config = loadConfig();

const server = new McpServer({
  name: "windows-admin-mcp",
  version: "1.0.0",
});

if (config.modules.services) registerServicesModule(server);
if (config.modules.events) registerEventsModule(server);
if (config.modules.scheduler) registerSchedulerModule(server);
if (config.modules.processes) registerProcessesModule(server);
if (config.modules.network) registerNetworkModule(server);
if (config.modules.diagnostics) registerDiagnosticsModule(server);
if (config.modules.safety) registerSafetyModule(server);
if (config.modules.observability) registerObservabilityModule(server);

// MCP Resources (always enabled)
registerResources(server);

const transport = new StdioServerTransport();
await server.connect(transport).catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
