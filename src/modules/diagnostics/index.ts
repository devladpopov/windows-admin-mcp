import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { escapePsString, runPowerShell, runPowerShellJson } from "../../utils/powershell.js";

export function registerDiagnosticsModule(server: McpServer) {
  // ── Tool 1: diagnose_service ──────────────────────────────────────────
  server.tool(
    "diagnose_service",
    "Diagnose why a Windows service is not working. Runs a chain of checks (status, config, event logs, dependencies, optional port check) and returns a structured report with a hypothesis.",
    {
      name: z.string().describe("Service name (e.g. 'wuauserv', 'MSSQLSERVER')"),
      port: z.number().optional().describe("Optional port number to check for conflicts"),
    },
    async ({ name, port }) => {
      const escaped = escapePsString(name);

      // 1. Service status and config
      const serviceInfoCmd = `
$svc = Get-Service -Name '${escaped}' -ErrorAction Stop
$wmi = Get-WmiObject Win32_Service -Filter "Name='${escaped}'"
@{
  Name = $svc.Name
  DisplayName = $svc.DisplayName
  Status = $svc.Status.ToString()
  StartType = $svc.StartType.ToString()
  Account = $wmi.StartName
  BinaryPath = $wmi.PathName
} | ConvertTo-Json -Depth 3
`;
      let serviceInfo: {
        Name: string;
        DisplayName: string;
        Status: string;
        StartType: string;
        Account: string | null;
        BinaryPath: string | null;
      };
      try {
        const { stdout } = await runPowerShell(serviceInfoCmd);
        serviceInfo = JSON.parse(stdout);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to get service '${name}': ${message}` }],
          isError: true,
        };
      }

      // 2. Port check (optional)
      let portCheck: { port: number; inUse: boolean; processHolding: string | null } | null = null;
      if (port !== undefined) {
        const safePort = Math.floor(port);
        const portCmd = `
$conn = Get-NetTCPConnection -LocalPort ${safePort} -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  @{ Port = ${safePort}; InUse = $true; ProcessHolding = if ($proc) { "$($proc.ProcessName) (PID $($proc.Id))" } else { "PID $($conn.OwningProcess)" } } | ConvertTo-Json
} else {
  @{ Port = ${safePort}; InUse = $false; ProcessHolding = $null } | ConvertTo-Json
}
`;
        try {
          const { stdout } = await runPowerShell(portCmd);
          if (stdout) {
            const parsed = JSON.parse(stdout);
            portCheck = { port: safePort, inUse: parsed.InUse, processHolding: parsed.ProcessHolding };
          }
        } catch {
          // Port check is best-effort
          portCheck = { port: safePort, inUse: false, processHolding: null };
        }
      }

      // 3. Recent error events (last 24h)
      const eventsCmd = `
$start = (Get-Date).AddHours(-24)
$events = @()
try {
  $events += Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=$start} -MaxEvents 50 -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match '${escaped}' } | Select-Object -First 10
} catch {}
try {
  $events += Get-WinEvent -FilterHashtable @{LogName='Application'; Level=1,2; StartTime=$start} -MaxEvents 50 -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match '${escaped}' } | Select-Object -First 10
} catch {}
$events | Select-Object -First 10 @{N='Time';E={$_.TimeCreated.ToString('o')}}, @{N='Id';E={$_.Id}}, @{N='Source';E={$_.ProviderName}}, @{N='Message';E={$_.Message.Substring(0, [Math]::Min(300, $_.Message.Length))}} | ConvertTo-Json -Depth 3
`;
      let recentErrors: Array<{ Time: string; Id: number; Source: string; Message: string }> = [];
      try {
        const { stdout } = await runPowerShell(eventsCmd);
        if (stdout) {
          const parsed = JSON.parse(stdout);
          recentErrors = Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch {
        // Events check is best-effort
      }

      // 4. Dependencies
      const depsCmd = `
$svc = Get-Service -Name '${escaped}'
$deps = $svc.ServicesDependedOn | ForEach-Object { @{ Name = $_.Name; Status = $_.Status.ToString() } }
if ($deps) { $deps | ConvertTo-Json -Depth 2 } else { '[]' }
`;
      let dependencies: Array<{ Name: string; Status: string }> = [];
      try {
        const { stdout } = await runPowerShell(depsCmd);
        if (stdout) {
          const parsed = JSON.parse(stdout);
          dependencies = Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch {
        // Dependencies check is best-effort
      }

      // 5. Generate hypothesis
      const hypothesis = generateHypothesis(serviceInfo, portCheck, recentErrors, dependencies);

      const report = {
        service: {
          name: serviceInfo.Name,
          displayName: serviceInfo.DisplayName,
          status: serviceInfo.Status,
          startType: serviceInfo.StartType,
          account: serviceInfo.Account,
          binaryPath: serviceInfo.BinaryPath,
        },
        portCheck,
        recentErrors: recentErrors.map((e) => ({
          time: e.Time,
          id: e.Id,
          source: e.Source,
          message: e.Message,
        })),
        dependencies: dependencies.map((d) => ({
          name: d.Name,
          status: d.Status,
        })),
        hypothesis,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
    }
  );

  // ── Tool 2: system_health ─────────────────────────────────────────────
  server.tool(
    "system_health",
    "Get a full system health overview in a single call: CPU, memory, disk, top processes, recent errors, and stopped auto-start services.",
    {},
    async () => {
      const healthCmd = `
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory, TotalVisibleMemorySize
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}}, @{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,2)}}, @{N='UsedPercent';E={[math]::Round(($_.Size - $_.FreeSpace) / $_.Size * 100, 1)}}
$procs = Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Name, Id, @{N='CpuSeconds';E={[math]::Round($_.CPU,1)}}, @{N='MemoryMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}
$errors = @()
try {
  $errors = Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=(Get-Date).AddHours(-1)} -MaxEvents 10 -ErrorAction SilentlyContinue |
    Select-Object @{N='Time';E={$_.TimeCreated.ToString('o')}}, Id, @{N='Source';E={$_.ProviderName}}, @{N='Message';E={$_.Message.Substring(0, [Math]::Min(200, $_.Message.Length))}}
} catch {}
$stoppedAuto = Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' } | Select-Object Name, DisplayName, Status

@{
  cpu = @{ averagePercent = $cpu }
  memory = @{
    totalMB = [math]::Round($os.TotalVisibleMemorySize / 1024, 0)
    freeMB = [math]::Round($os.FreePhysicalMemory / 1024, 0)
    usedPercent = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize * 100, 1)
  }
  disks = $disks
  topProcesses = $procs
  recentErrors = $errors
  stoppedAutoServices = $stoppedAuto
} | ConvertTo-Json -Depth 4
`;
      try {
        const { stdout, stderr } = await runPowerShell(healthCmd);
        if (!stdout) {
          return {
            content: [{ type: "text" as const, text: `Failed to collect system health: ${stderr || "No output"}` }],
            isError: true,
          };
        }
        const data = JSON.parse(stdout);
        // Normalize arrays (PowerShell returns single objects instead of 1-element arrays)
        if (data.disks && !Array.isArray(data.disks)) data.disks = [data.disks];
        if (data.topProcesses && !Array.isArray(data.topProcesses)) data.topProcesses = [data.topProcesses];
        if (data.recentErrors && !Array.isArray(data.recentErrors)) data.recentErrors = [data.recentErrors];
        if (data.stoppedAutoServices && !Array.isArray(data.stoppedAutoServices)) data.stoppedAutoServices = [data.stoppedAutoServices];
        if (!data.recentErrors) data.recentErrors = [];
        if (!data.stoppedAutoServices) data.stoppedAutoServices = [];

        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `System health check failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 3: services_bulk ─────────────────────────────────────────────
  server.tool(
    "services_bulk",
    "Perform an action (Start, Stop, Restart) on all Windows services matching a name pattern.",
    {
      namePattern: z.string().describe("Service name pattern (wildcard supported, e.g. 'sql*', '*web*')"),
      action: z.enum(["Start", "Stop", "Restart"]).describe("Action to perform on matching services"),
    },
    async ({ namePattern, action }) => {
      const escaped = escapePsString(namePattern);

      // First, list matching services
      const listCmd = `Get-Service -Name '${escaped}' -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType`;
      let services: Array<{ Name: string; Status: string; StartType: string }>;
      try {
        const result = await runPowerShellJson<Array<{ Name: string; Status: string; StartType: string }> | { Name: string; Status: string; StartType: string } | null>(listCmd);
        if (!result) {
          return {
            content: [{ type: "text" as const, text: `No services found matching pattern '${namePattern}'.` }],
            isError: true,
          };
        }
        services = Array.isArray(result) ? result : [result];
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to list services: ${message}` }],
          isError: true,
        };
      }

      if (services.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No services found matching pattern '${namePattern}'.` }],
          isError: true,
        };
      }

      // Perform action on each service
      const results: Array<{ name: string; action: string; success: boolean; newStatus?: string; error?: string }> = [];
      for (const svc of services) {
        const svcEscaped = escapePsString(svc.Name);
        try {
          await runPowerShell(`${action}-Service -Name '${svcEscaped}' -Force -ErrorAction Stop`);
          const { stdout } = await runPowerShell(`(Get-Service -Name '${svcEscaped}').Status.ToString()`);
          results.push({ name: svc.Name, action, success: true, newStatus: stdout.trim() });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ name: svc.Name, action, success: false, error: message });
        }
      }

      const summary = {
        pattern: namePattern,
        action,
        totalMatched: services.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  // ── Tool 4: scheduler_bulk ────────────────────────────────────────────
  server.tool(
    "scheduler_bulk",
    "Perform an action (Enable, Disable) on all scheduled tasks matching a name pattern.",
    {
      namePattern: z.string().describe("Task name pattern (wildcard supported, e.g. '*Backup*', 'MyApp*')"),
      action: z.enum(["Enable", "Disable"]).describe("Action to perform on matching tasks"),
    },
    async ({ namePattern, action }) => {
      const escaped = escapePsString(namePattern);

      // List matching tasks
      const listCmd = `Get-ScheduledTask | Where-Object { $_.TaskName -like '${escaped}' } | Select-Object TaskName, TaskPath, State`;
      let tasks: Array<{ TaskName: string; TaskPath: string; State: string }>;
      try {
        const result = await runPowerShellJson<Array<{ TaskName: string; TaskPath: string; State: string }> | { TaskName: string; TaskPath: string; State: string } | null>(listCmd);
        if (!result) {
          return {
            content: [{ type: "text" as const, text: `No scheduled tasks found matching pattern '${namePattern}'.` }],
            isError: true,
          };
        }
        tasks = Array.isArray(result) ? result : [result];
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to list tasks: ${message}` }],
          isError: true,
        };
      }

      if (tasks.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No scheduled tasks found matching pattern '${namePattern}'.` }],
          isError: true,
        };
      }

      // Perform action on each task
      const results: Array<{ name: string; path: string; action: string; success: boolean; newState?: string; error?: string }> = [];
      for (const task of tasks) {
        const taskNameEscaped = escapePsString(task.TaskName);
        const taskPathEscaped = escapePsString(task.TaskPath);
        const actionCmd = action === "Enable"
          ? `Enable-ScheduledTask -TaskName '${taskNameEscaped}' -TaskPath '${taskPathEscaped}' -ErrorAction Stop`
          : `Disable-ScheduledTask -TaskName '${taskNameEscaped}' -TaskPath '${taskPathEscaped}' -ErrorAction Stop`;
        try {
          await runPowerShell(actionCmd);
          const { stdout } = await runPowerShell(
            `(Get-ScheduledTask -TaskName '${taskNameEscaped}' -TaskPath '${taskPathEscaped}').State.ToString()`
          );
          results.push({ name: task.TaskName, path: task.TaskPath, action, success: true, newState: stdout.trim() });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ name: task.TaskName, path: task.TaskPath, action, success: false, error: message });
        }
      }

      const summary = {
        pattern: namePattern,
        action,
        totalMatched: tasks.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );
}

// ── Hypothesis generator ──────────────────────────────────────────────
function generateHypothesis(
  service: { Status: string; StartType: string },
  portCheck: { port: number; inUse: boolean; processHolding: string | null } | null,
  recentErrors: Array<{ Id: number; Message: string }>,
  dependencies: Array<{ Name: string; Status: string }>
): string {
  const issues: string[] = [];

  // Check for stopped auto-start service
  if (service.Status === "Stopped" && service.StartType === "Automatic") {
    issues.push("Service should be running but is stopped (StartType is Automatic)");
  }

  // Check for crash events (7031 = SCM unexpected termination, 7034 = SCM terminated unexpectedly)
  const crashEventIds = [7031, 7034];
  const crashEvents = recentErrors.filter((e) => crashEventIds.includes(e.Id));
  if (crashEvents.length > 0) {
    issues.push(`Service is crashing repeatedly (${crashEvents.length} crash event(s) in last 24h)`);
  }

  // Check port conflict
  if (portCheck && portCheck.inUse) {
    issues.push(`Port ${portCheck.port} conflict with ${portCheck.processHolding || "unknown process"}`);
  }

  // Check dependencies
  const stoppedDeps = dependencies.filter((d) => d.Status !== "Running");
  if (stoppedDeps.length > 0) {
    const depNames = stoppedDeps.map((d) => d.Name).join(", ");
    issues.push(`Dependency service(s) not running: ${depNames}`);
  }

  // Check for other recent errors
  if (issues.length === 0 && recentErrors.length > 0) {
    issues.push(`${recentErrors.length} recent error(s) found in event logs — review messages for details`);
  }

  if (issues.length === 0) {
    return "Service appears healthy, no recent errors found";
  }

  return issues.join(". ") + ".";
}
