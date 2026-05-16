import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runPowerShell, runPowerShellJson } from "../../utils/powershell.js";

export function registerServicesModule(server: McpServer) {
  server.tool(
    "services_list",
    "List Windows services. Optionally filter by status (Running, Stopped) or name pattern.",
    {
      status: z.enum(["Running", "Stopped", "All"]).optional().describe("Filter by service status"),
      namePattern: z.string().optional().describe("Filter by service name (wildcard supported, e.g. 'sql*')"),
    },
    async ({ status, namePattern }) => {
      let cmd = "Get-Service";
      if (namePattern) cmd += ` -Name '${namePattern}'`;
      if (status && status !== "All") cmd += ` | Where-Object { $_.Status -eq '${status}' }`;
      cmd += " | Select-Object Name, DisplayName, Status, StartType";

      const result = await runPowerShellJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "services_get",
    "Get detailed information about a specific Windows service.",
    {
      name: z.string().describe("Service name (e.g. 'wuauserv', 'Spooler')"),
    },
    async ({ name }) => {
      const cmd = `Get-Service -Name '${name}' | Select-Object Name, DisplayName, Status, StartType, DependentServices, ServicesDependedOn`;
      const result = await runPowerShellJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "services_start",
    "Start a Windows service.",
    {
      name: z.string().describe("Service name to start"),
    },
    async ({ name }) => {
      await runPowerShell(`Start-Service -Name '${name}'`);
      const result = await runPowerShellJson(`Get-Service -Name '${name}' | Select-Object Name, Status`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "services_stop",
    "Stop a Windows service.",
    {
      name: z.string().describe("Service name to stop"),
      force: z.boolean().optional().describe("Force stop (also stops dependent services)"),
    },
    async ({ name, force }) => {
      const forceFlag = force ? " -Force" : "";
      await runPowerShell(`Stop-Service -Name '${name}'${forceFlag}`);
      const result = await runPowerShellJson(`Get-Service -Name '${name}' | Select-Object Name, Status`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "services_restart",
    "Restart a Windows service.",
    {
      name: z.string().describe("Service name to restart"),
      force: z.boolean().optional().describe("Force restart (also restarts dependent services)"),
    },
    async ({ name, force }) => {
      const forceFlag = force ? " -Force" : "";
      await runPowerShell(`Restart-Service -Name '${name}'${forceFlag}`);
      const result = await runPowerShellJson(`Get-Service -Name '${name}' | Select-Object Name, Status`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "services_set_startup",
    "Change the startup type of a Windows service.",
    {
      name: z.string().describe("Service name"),
      startupType: z.enum(["Automatic", "Manual", "Disabled", "AutomaticDelayedStart"]).describe("Startup type"),
    },
    async ({ name, startupType }) => {
      const type = startupType === "AutomaticDelayedStart" ? "AutomaticDelayedStart" : startupType;
      await runPowerShell(`Set-Service -Name '${name}' -StartupType '${type}'`);
      const result = await runPowerShellJson(`Get-Service -Name '${name}' | Select-Object Name, StartType`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
