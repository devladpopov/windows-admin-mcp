import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { escapePsString, runPowerShell, runPowerShellJson } from "../../utils/powershell.js";

// In-memory watermark for events_watch: tracks last seen timestamp per log
const watermarks = new Map<string, string>();

export function registerObservabilityModule(server: McpServer) {
  // ── Tool 1: events_watch ─────────────────────────────────────────────
  server.tool(
    "events_watch",
    "Poll for new Critical/Error events since the last check (or since a given timestamp). Returns only the delta. Useful for periodic monitoring.",
    {
      logName: z.string().default("System").describe("Event log name (System, Application, Security)"),
      level: z.enum(["Critical", "Error", "CriticalAndError"]).default("CriticalAndError").describe("Event level to watch"),
      since: z.string().optional().describe("ISO 8601 timestamp to start from. If omitted, uses the last watermark or defaults to 1 hour ago."),
    },
    async ({ logName, level, since }) => {
      const logKey = `${logName}:${level}`;

      // Determine start time
      let startTime: string;
      if (since) {
        startTime = since;
      } else if (watermarks.has(logKey)) {
        startTime = watermarks.get(logKey)!;
      } else {
        startTime = new Date(Date.now() - 3600_000).toISOString();
      }

      const levelFilter = level === "Critical" ? "1" : level === "Error" ? "2" : "1,2";
      const escaped = escapePsString(logName);

      const cmd = `
$events = @()
try {
  $events = Get-WinEvent -FilterHashtable @{LogName='${escaped}'; Level=${levelFilter}; StartTime='${escapePsString(startTime)}'} -MaxEvents 100 -ErrorAction SilentlyContinue |
    Select-Object @{N='Time';E={$_.TimeCreated.ToString('o')}}, Id, LevelDisplayName, @{N='Source';E={$_.ProviderName}}, @{N='Message';E={$_.Message.Substring(0, [Math]::Min(300, $_.Message.Length))}}
} catch {}
if ($events.Count -eq 0) { '[]' } else { $events | ConvertTo-Json -Depth 3 }
`;

      try {
        const { stdout } = await runPowerShell(cmd);
        const events = stdout ? JSON.parse(stdout) : [];
        const normalized = Array.isArray(events) ? events : [events];

        // Update watermark to now
        watermarks.set(logKey, new Date().toISOString());

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              logName,
              level,
              since: startTime,
              newEvents: normalized.length,
              nextWatermark: watermarks.get(logKey),
              events: normalized,
            }, null, 2),
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Events watch failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 2: services_watch ───────────────────────────────────────────
  server.tool(
    "services_watch",
    "Check for auto-start services that are not running. Returns a list of services that should be running but are stopped or in a degraded state.",
    {},
    async () => {
      const cmd = `
$stopped = Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' } |
  Select-Object Name, DisplayName, @{N='Status';E={$_.Status.ToString()}}, @{N='StartType';E={$_.StartType.ToString()}}
if ($stopped) { $stopped | ConvertTo-Json -Depth 2 } else { '[]' }
`;

      try {
        const { stdout } = await runPowerShell(cmd);
        const services = stdout ? JSON.parse(stdout) : [];
        const normalized = Array.isArray(services) ? services : [services];

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              stoppedAutoStartServices: normalized.length,
              timestamp: new Date().toISOString(),
              services: normalized,
            }, null, 2),
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Services watch failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 3: system_changes ───────────────────────────────────────────
  server.tool(
    "system_changes",
    "Detect what changed on the system in the last N hours: new services installed, new scheduled tasks created, and services that changed state.",
    {
      hours: z.number().min(1).max(168).default(1).describe("Look back N hours (default: 1, max: 168 = 7 days)"),
    },
    async ({ hours }) => {
      const safeHours = Math.floor(hours);

      const cmd = `
$since = (Get-Date).AddHours(-${safeHours})

# New services installed (Event ID 7045 in System log)
$newServices = @()
try {
  $newServices = Get-WinEvent -FilterHashtable @{LogName='System'; Id=7045; StartTime=$since} -MaxEvents 50 -ErrorAction SilentlyContinue |
    Select-Object @{N='Time';E={$_.TimeCreated.ToString('o')}}, @{N='ServiceName';E={$_.Properties[0].Value}}, @{N='ServicePath';E={$_.Properties[1].Value}}, @{N='ServiceType';E={$_.Properties[2].Value}}
} catch {}

# Service state changes (Event ID 7036 in System log)
$stateChanges = @()
try {
  $stateChanges = Get-WinEvent -FilterHashtable @{LogName='System'; Id=7036; StartTime=$since} -MaxEvents 100 -ErrorAction SilentlyContinue |
    Select-Object @{N='Time';E={$_.TimeCreated.ToString('o')}}, @{N='Message';E={$_.Message.Substring(0, [Math]::Min(200, $_.Message.Length))}}
} catch {}

# New scheduled tasks (created recently)
$newTasks = @()
try {
  $newTasks = Get-ScheduledTask | Where-Object { $_.Date -and [DateTime]::Parse($_.Date) -gt $since } |
    Select-Object TaskName, TaskPath, State, @{N='Created';E={$_.Date}}
} catch {}

@{
  periodHours = ${safeHours}
  since = $since.ToString('o')
  newServicesInstalled = if ($newServices) { $newServices } else { @() }
  serviceStateChanges = if ($stateChanges.Count -gt 20) { $stateChanges | Select-Object -First 20 } else { if ($stateChanges) { $stateChanges } else { @() } }
  newScheduledTasks = if ($newTasks) { $newTasks } else { @() }
} | ConvertTo-Json -Depth 4
`;

      try {
        const { stdout } = await runPowerShell(cmd);
        if (!stdout) {
          return {
            content: [{ type: "text" as const, text: "No changes detected." }],
          };
        }
        const data = JSON.parse(stdout);
        // Normalize arrays
        for (const key of ["newServicesInstalled", "serviceStateChanges", "newScheduledTasks"]) {
          if (data[key] && !Array.isArray(data[key])) data[key] = [data[key]];
          if (!data[key]) data[key] = [];
        }

        const totalChanges =
          data.newServicesInstalled.length +
          data.serviceStateChanges.length +
          data.newScheduledTasks.length;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ totalChanges, ...data }, null, 2),
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `System changes detection failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 4: error_trends ─────────────────────────────────────────────
  server.tool(
    "error_trends",
    "Analyze error event trends over time. Shows error counts per hour to identify if error rate is growing, shrinking, or stable.",
    {
      logName: z.string().default("System").describe("Event log name"),
      hours: z.number().min(2).max(168).default(24).describe("Analysis period in hours (default: 24)"),
    },
    async ({ logName, hours }) => {
      const safeHours = Math.floor(hours);
      const escaped = escapePsString(logName);

      const cmd = `
$since = (Get-Date).AddHours(-${safeHours})
$events = @()
try {
  $events = Get-WinEvent -FilterHashtable @{LogName='${escaped}'; Level=1,2; StartTime=$since} -MaxEvents 2000 -ErrorAction SilentlyContinue
} catch {}

if ($events.Count -eq 0) {
  @{ totalErrors = 0; hourlyBreakdown = @(); trend = 'none' } | ConvertTo-Json -Depth 3
} else {
  $grouped = $events | Group-Object { $_.TimeCreated.ToString('yyyy-MM-dd HH:00') } |
    Select-Object @{N='Hour';E={$_.Name}}, Count |
    Sort-Object Hour

  # Calculate trend: compare first half vs second half
  $counts = $grouped | ForEach-Object { $_.Count }
  $mid = [math]::Floor($counts.Count / 2)
  if ($mid -gt 0) {
    $firstHalf = ($counts[0..($mid-1)] | Measure-Object -Average).Average
    $secondHalf = ($counts[$mid..($counts.Count-1)] | Measure-Object -Average).Average
    if ($secondHalf -gt $firstHalf * 1.5) { $trend = 'growing' }
    elseif ($secondHalf -lt $firstHalf * 0.5) { $trend = 'shrinking' }
    else { $trend = 'stable' }
  } else {
    $trend = 'insufficient_data'
  }

  @{
    totalErrors = $events.Count
    periodHours = ${safeHours}
    trend = $trend
    hourlyBreakdown = $grouped
    topSources = ($events | Group-Object ProviderName | Sort-Object Count -Descending | Select-Object -First 5 Name, Count)
    topEventIds = ($events | Group-Object Id | Sort-Object Count -Descending | Select-Object -First 5 Name, Count)
  } | ConvertTo-Json -Depth 4
}
`;

      try {
        const { stdout } = await runPowerShell(cmd);
        if (!stdout) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ totalErrors: 0, trend: "none" }, null, 2) }],
          };
        }
        const data = JSON.parse(stdout);
        // Normalize arrays
        for (const key of ["hourlyBreakdown", "topSources", "topEventIds"]) {
          if (data[key] && !Array.isArray(data[key])) data[key] = [data[key]];
          if (!data[key]) data[key] = [];
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error trends analysis failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 5: service_restarts ─────────────────────────────────────────
  server.tool(
    "service_restarts",
    "Analyze service restart frequency from event logs. Identifies services that restart frequently, which may indicate instability.",
    {
      hours: z.number().min(1).max(168).default(24).describe("Analysis period in hours (default: 24)"),
      minRestarts: z.number().min(1).default(2).describe("Minimum restart count to include in results (default: 2)"),
    },
    async ({ hours, minRestarts }) => {
      const safeHours = Math.floor(hours);
      const safeMin = Math.floor(minRestarts);

      // Event IDs: 7036 = service state change, 7031 = crash + auto-restart, 7034 = unexpected termination
      const cmd = `
$since = (Get-Date).AddHours(-${safeHours})
$events = @()
try {
  $events = Get-WinEvent -FilterHashtable @{LogName='System'; Id=7036,7031,7034; StartTime=$since} -MaxEvents 5000 -ErrorAction SilentlyContinue
} catch {}

if ($events.Count -eq 0) {
  @{ totalRestartEvents = 0; services = @() } | ConvertTo-Json -Depth 3
} else {
  # Extract service name from message (first quoted text or first property)
  $serviceEvents = $events | ForEach-Object {
    $svcName = ''
    if ($_.Id -in 7031,7034) {
      $svcName = $_.Properties[0].Value
    } else {
      # 7036: "The X service entered the Y state."
      if ($_.Message -match '^The (.+?) service entered the') { $svcName = $Matches[1] }
    }
    [PSCustomObject]@{ Service = $svcName; EventId = $_.Id; Time = $_.TimeCreated }
  } | Where-Object { $_.Service -ne '' }

  $grouped = $serviceEvents | Group-Object Service |
    Where-Object { $_.Count -ge ${safeMin} } |
    Sort-Object Count -Descending |
    Select-Object -First 20 @{N='Service';E={$_.Name}}, Count, @{N='LastEvent';E={($_.Group | Sort-Object Time -Descending | Select-Object -First 1).Time.ToString('o')}}, @{N='CrashCount';E={($_.Group | Where-Object { $_.EventId -in 7031,7034 }).Count}}

  @{
    periodHours = ${safeHours}
    totalRestartEvents = $events.Count
    servicesWithFrequentRestarts = if ($grouped) { $grouped } else { @() }
  } | ConvertTo-Json -Depth 4
}
`;

      try {
        const { stdout } = await runPowerShell(cmd);
        if (!stdout) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ totalRestartEvents: 0, services: [] }, null, 2) }],
          };
        }
        const data = JSON.parse(stdout);
        if (data.servicesWithFrequentRestarts && !Array.isArray(data.servicesWithFrequentRestarts)) {
          data.servicesWithFrequentRestarts = [data.servicesWithFrequentRestarts];
        }
        if (!data.servicesWithFrequentRestarts) data.servicesWithFrequentRestarts = [];

        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Service restarts analysis failed: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
