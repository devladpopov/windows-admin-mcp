import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { escapePsString, runPowerShellChecked, runPowerShellJson } from "../../utils/powershell.js";

export function registerProcessesModule(server: McpServer) {
  server.tool(
    "processes_list",
    "List processes sorted by CPU, Memory, or Name. Optionally filter by name pattern.",
    {
      sortBy: z.enum(["CPU", "Memory", "Name"]).default("CPU").describe("Sort processes by CPU usage, Memory usage, or Name"),
      limit: z.number().min(1).max(200).default(20).describe("Number of processes to return"),
      namePattern: z.string().optional().describe("Filter by process name (wildcard supported, e.g. 'chrome*')"),
    },
    async ({ sortBy, limit, namePattern }) => {
      let cmd = "Get-Process";
      if (namePattern) cmd += ` -Name '${escapePsString(namePattern)}'`;
      cmd += " -ErrorAction SilentlyContinue";

      const sortProp = sortBy === "Memory" ? "WorkingSet64" : sortBy;
      cmd += ` | Sort-Object ${sortProp} -Descending`;
      cmd += ` | Select-Object -First ${Math.floor(limit)} Id, ProcessName, CPU, @{N='MemoryMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, StartTime`;

      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: "No processes found matching the criteria." }] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error listing processes: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "processes_get",
    "Get detailed information about a specific process by name or PID.",
    {
      name: z.string().optional().describe("Process name (e.g. 'chrome', 'svchost')"),
      pid: z.number().optional().describe("Process ID"),
    },
    async ({ name, pid }) => {
      if (!name && pid === undefined) {
        return { content: [{ type: "text", text: "Either 'name' or 'pid' must be provided." }], isError: true };
      }

      let cmd: string;
      if (pid !== undefined) {
        cmd = `Get-Process -Id ${Math.floor(pid)} -ErrorAction Stop`;
      } else {
        cmd = `Get-Process -Name '${escapePsString(name!)}' -ErrorAction Stop`;
      }
      cmd += " | Select-Object Id, ProcessName, CPU, @{N='MemoryMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, @{N='VirtualMemoryMB';E={[math]::Round($_.VirtualMemorySize64/1MB,1)}}, StartTime, Path, @{N='ThreadCount';E={$_.Threads.Count}}, @{N='HandleCount';E={$_.HandleCount}}, PriorityClass";

      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: "Process not found." }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error getting process: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "processes_kill",
    "Kill (terminate) a process by name or PID.",
    {
      name: z.string().optional().describe("Process name to kill"),
      pid: z.number().optional().describe("Process ID to kill"),
      force: z.boolean().default(false).describe("Force kill the process"),
    },
    async ({ name, pid, force }) => {
      if (!name && pid === undefined) {
        return { content: [{ type: "text", text: "Either 'name' or 'pid' must be provided." }], isError: true };
      }

      const forceFlag = force ? " -Force" : "";
      let cmd: string;
      if (pid !== undefined) {
        cmd = `Stop-Process -Id ${Math.floor(pid)}${forceFlag} -ErrorAction Stop`;
      } else {
        cmd = `Stop-Process -Name '${escapePsString(name!)}'${forceFlag} -ErrorAction Stop`;
      }

      try {
        await runPowerShellChecked(cmd);
        const target = pid !== undefined ? `PID ${pid}` : `'${name}'`;
        return { content: [{ type: "text", text: `Process ${target} terminated successfully.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error killing process: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "processes_ports",
    "Show which processes are holding which TCP ports (listening and established connections).",
    {
      port: z.number().optional().describe("Filter by specific port number"),
    },
    async ({ port }) => {
      let cmd = "Get-NetTCPConnection -ErrorAction SilentlyContinue";
      if (port !== undefined) {
        cmd += ` | Where-Object { $_.LocalPort -eq ${Math.floor(port)} -or $_.RemotePort -eq ${Math.floor(port)} }`;
      } else {
        cmd += " | Where-Object { $_.State -eq 'Listen' }";
      }
      cmd += " | ForEach-Object { $conn = $_; $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; [PSCustomObject]@{ LocalPort = $conn.LocalPort; RemotePort = $conn.RemotePort; State = $conn.State; PID = $conn.OwningProcess; ProcessName = $proc.ProcessName; Path = $proc.Path } }";

      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: "No connections found." }] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error querying ports: ${e.message}` }], isError: true };
      }
    }
  );
}
