import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runPowerShell } from "./utils/powershell.js";

export function registerResources(server: McpServer) {
  // ── Resource 1: system://info ──────────────────────────────────────────
  server.resource(
    "system-info",
    "system://info",
    { description: "Basic system information: OS version, hostname, CPU, RAM, uptime" },
    async () => {
      const cmd = `
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$uptime = (Get-Date) - $os.LastBootUpTime
@{
  hostname = $env:COMPUTERNAME
  osVersion = $os.Caption + ' ' + $os.Version
  osBuild = $os.BuildNumber
  architecture = $os.OSArchitecture
  cpu = $cpu.Name
  cpuCores = $cpu.NumberOfCores
  cpuLogicalProcessors = $cpu.NumberOfLogicalProcessors
  totalMemoryGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
  freeMemoryGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
  uptimeDays = [math]::Round($uptime.TotalDays, 2)
  uptimeHours = [math]::Round($uptime.TotalHours, 1)
  lastBoot = $os.LastBootUpTime.ToString('o')
  currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  domain = $env:USERDOMAIN
  timeZone = (Get-TimeZone).Id
} | ConvertTo-Json -Depth 2
`;
      try {
        const { stdout } = await runPowerShell(cmd);
        return {
          contents: [{
            uri: "system://info",
            mimeType: "application/json",
            text: stdout || "{}",
          }],
        };
      } catch {
        return {
          contents: [{
            uri: "system://info",
            mimeType: "text/plain",
            text: "Failed to collect system information",
          }],
        };
      }
    }
  );

  // ── Resource 2: system://health ────────────────────────────────────────
  server.resource(
    "system-health",
    "system://health",
    { description: "Current system health snapshot: CPU load, memory usage, disk space, stopped auto-start services, recent errors" },
    async () => {
      const cmd = `
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}}, @{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,1)}}, @{N='UsedPercent';E={[math]::Round(($_.Size - $_.FreeSpace)/$_.Size*100,1)}}
$stoppedAuto = @(Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' } | Select-Object Name, DisplayName)
$recentErrors = 0
try { $recentErrors = (Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=(Get-Date).AddHours(-1)} -ErrorAction SilentlyContinue | Measure-Object).Count } catch {}

$memUsed = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize * 100, 1)

# Overall status
$status = 'healthy'
if ($cpu -gt 90 -or $memUsed -gt 90) { $status = 'critical' }
elseif ($cpu -gt 70 -or $memUsed -gt 80 -or $stoppedAuto.Count -gt 3 -or $recentErrors -gt 10) { $status = 'warning' }

@{
  status = $status
  timestamp = (Get-Date).ToString('o')
  cpu = @{ loadPercent = $cpu }
  memory = @{
    totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    usedPercent = $memUsed
  }
  disks = $disks
  stoppedAutoStartServices = $stoppedAuto.Count
  recentErrorsLastHour = $recentErrors
} | ConvertTo-Json -Depth 3
`;
      try {
        const { stdout } = await runPowerShell(cmd);
        return {
          contents: [{
            uri: "system://health",
            mimeType: "application/json",
            text: stdout || "{}",
          }],
        };
      } catch {
        return {
          contents: [{
            uri: "system://health",
            mimeType: "text/plain",
            text: "Failed to collect health status",
          }],
        };
      }
    }
  );

  // ── Resource 3: system://services ──────────────────────────────────────
  server.resource(
    "services-summary",
    "system://services",
    { description: "Summary of Windows services: counts by status and startup type" },
    async () => {
      const cmd = `
$all = Get-Service
$byStatus = $all | Group-Object Status | Select-Object @{N='Status';E={$_.Name}}, Count
$byStart = $all | Group-Object StartType | Select-Object @{N='StartType';E={$_.Name}}, Count
@{
  total = $all.Count
  byStatus = $byStatus
  byStartType = $byStart
} | ConvertTo-Json -Depth 3
`;
      try {
        const { stdout } = await runPowerShell(cmd);
        return {
          contents: [{
            uri: "system://services",
            mimeType: "application/json",
            text: stdout || "{}",
          }],
        };
      } catch {
        return {
          contents: [{
            uri: "system://services",
            mimeType: "text/plain",
            text: "Failed to collect services summary",
          }],
        };
      }
    }
  );
}
