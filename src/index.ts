#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerServicesModule } from "./modules/services/index.js";
import { registerEventsModule } from "./modules/events/index.js";
import { registerSchedulerModule } from "./modules/scheduler/index.js";

const server = new McpServer({
  name: "windows-admin-mcp",
  version: "0.1.0",
});

// Register all modules
registerServicesModule(server);
registerEventsModule(server);
registerSchedulerModule(server);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
