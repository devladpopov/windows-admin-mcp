import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { escapePsString, runPowerShellJson } from "../../utils/powershell.js";

export function registerEventsModule(server: McpServer) {
  server.tool(
    "events_query",
    "Query Windows Event Viewer logs. Filter by log name, level, source, time range, and keyword.",
    {
      logName: z.string().default("System").describe("Event log name (System, Application, Security, etc.)"),
      level: z.enum(["Critical", "Error", "Warning", "Information", "Verbose", "All"]).optional().describe("Event level filter"),
      source: z.string().optional().describe("Event source/provider name"),
      maxEvents: z.number().min(1).max(500).default(50).describe("Maximum number of events to return"),
      afterTime: z.string().optional().describe("Return events after this time (ISO 8601, e.g. '2024-01-01T00:00:00')"),
      beforeTime: z.string().optional().describe("Return events before this time (ISO 8601)"),
      keyword: z.string().optional().describe("Search keyword in event message (literal match)"),
    },
    async ({ logName, level, source, maxEvents, afterTime, beforeTime, keyword }) => {
      const filters: string[] = [`LogName='${escapePsString(logName)}'`];

      if (level && level !== "All") {
        const levelMap: Record<string, number> = {
          Critical: 1,
          Error: 2,
          Warning: 3,
          Information: 4,
          Verbose: 5,
        };
        filters.push(`Level=${levelMap[level]}`);
      }

      if (source) filters.push(`ProviderName='${escapePsString(source)}'`);
      if (afterTime) filters.push(`StartTime='${escapePsString(afterTime)}'`);
      if (beforeTime) filters.push(`EndTime='${escapePsString(beforeTime)}'`);

      let cmd = `Get-WinEvent -FilterHashtable @{${filters.join("; ")}} -MaxEvents ${Math.floor(maxEvents)} -ErrorAction SilentlyContinue`;
      cmd += " | Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message";

      if (keyword) {
        cmd += ` | Where-Object { $_.Message -like '*${escapePsString(keyword).replace(/[*?\[\]]/g, '`$&')}*' }`;
      }

      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: "No events found matching the specified criteria." }] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        if (e.message?.includes("No events were found")) {
          return { content: [{ type: "text", text: "No events found matching the specified criteria." }] };
        }
        return { content: [{ type: "text", text: `Error querying events: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "events_logs_list",
    "List available Windows Event Viewer log names.",
    {},
    async () => {
      const cmd = "Get-WinEvent -ListLog * -ErrorAction SilentlyContinue | Where-Object { $_.RecordCount -gt 0 } | Select-Object LogName, RecordCount, LastWriteTime | Sort-Object -Property RecordCount -Descending | Select-Object -First 50";
      const result = await runPowerShellJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "events_sources_list",
    "List event sources/providers for a specific log.",
    {
      logName: z.string().default("System").describe("Event log name"),
    },
    async ({ logName }) => {
      const cmd = `Get-WinEvent -ListProvider * -ErrorAction SilentlyContinue | Where-Object { $_.LogLinks.LogName -contains '${escapePsString(logName)}' } | Select-Object Name | Sort-Object Name`;
      const result = await runPowerShellJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "events_summary",
    "Get a summary of recent events grouped by level for a specific log.",
    {
      logName: z.string().default("System").describe("Event log name"),
      hours: z.number().min(1).max(720).default(24).describe("Look back N hours"),
    },
    async ({ logName, hours }) => {
      const cmd = `Get-WinEvent -FilterHashtable @{LogName='${escapePsString(logName)}'; StartTime=(Get-Date).AddHours(-${Math.floor(hours)})} -ErrorAction SilentlyContinue | Group-Object LevelDisplayName | Select-Object Name, Count | Sort-Object Count -Descending`;
      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: "No events found in the specified time range." }] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );
}
