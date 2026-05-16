#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerServicesModule } from "./modules/services/index.js";
import { registerEventsModule } from "./modules/events/index.js";
import { registerSchedulerModule } from "./modules/scheduler/index.js";

if (process.platform !== "win32") {
  console.error("windows-admin-mcp only runs on Windows.");
  process.exit(1);
}

const server = new McpServer({
  name: "windows-admin-mcp",
  version: "0.1.0",
});

registerServicesModule(server);
registerEventsModule(server);
registerSchedulerModule(server);

const transport = new StdioServerTransport();
await server.connect(transport).catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
