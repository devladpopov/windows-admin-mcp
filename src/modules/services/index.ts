import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { escapePsString, runPowerShellChecked, runPowerShellJson } from "../../utils/powershell.js";

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
      if (namePattern) cmd += ` -Name '${escapePsString(namePattern)}'`;
      if (status && status !== "All") cmd += ` | Where-Object { $_.Status -eq '${escapePsString(status)}' }`;
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
      const cmd = `Get-Service -Name '${escapePsString(name)}' | Select-Object Name, DisplayName, Status, StartType, DependentServices, ServicesDependedOn`;
      const result = await runPowerShellJson(cmd);
      if (!result) return { content: [{ type: "text", text: `Service '${name}' not found.` }], isError: true };
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
      const escaped = escapePsString(name);
      await runPowerShellChecked(`Start-Service -Name '${escaped}'`);
      const result = await runPowerShellJson(`Get-Service -Name '${escaped}' | Select-Object Name, Status`);
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
      const escaped = escapePsString(name);
      const forceFlag = force ? " -Force" : "";
      await runPowerShellChecked(`Stop-Service -Name '${escaped}'${forceFlag}`);
      const result = await runPowerShellJson(`Get-Service -Name '${escaped}' | Select-Object Name, Status`);
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
      const escaped = escapePsString(name);
      const forceFlag = force ? " -Force" : "";
      await runPowerShellChecked(`Restart-Service -Name '${escaped}'${forceFlag}`);
      const result = await runPowerShellJson(`Get-Service -Name '${escaped}' | Select-Object Name, Status`);
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
      const escaped = escapePsString(name);
      await runPowerShellChecked(`Set-Service -Name '${escaped}' -StartupType '${startupType}'`);
      const result = await runPowerShellJson(`Get-Service -Name '${escaped}' | Select-Object Name, StartType`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
