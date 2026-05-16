import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runPowerShell, runPowerShellJson } from "../../utils/powershell.js";

export function registerSchedulerModule(server: McpServer) {
  server.tool(
    "scheduler_list",
    "List scheduled tasks. Optionally filter by path or state.",
    {
      taskPath: z.string().optional().describe("Task folder path (e.g. '\\\\Microsoft\\\\Windows\\\\' or '\\\\')"),
      state: z.enum(["Ready", "Running", "Disabled", "All"]).optional().describe("Filter by task state"),
    },
    async ({ taskPath, state }) => {
      let cmd = "Get-ScheduledTask";
      if (taskPath) cmd += ` -TaskPath '${taskPath}'`;
      if (state && state !== "All") cmd += ` | Where-Object { $_.State -eq '${state}' }`;
      cmd += " | Select-Object TaskName, TaskPath, State, Description";

      const result = await runPowerShellJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "scheduler_get",
    "Get detailed information about a specific scheduled task including triggers and actions.",
    {
      taskName: z.string().describe("Task name"),
      taskPath: z.string().optional().describe("Task path (default: '\\\\')"),
    },
    async ({ taskName, taskPath }) => {
      const path = taskPath || "\\";
      const cmd = `
        $task = Get-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}'
        $info = Get-ScheduledTaskInfo -TaskName '${taskName}' -TaskPath '${path}'
        [PSCustomObject]@{
          TaskName = $task.TaskName
          TaskPath = $task.TaskPath
          State = $task.State
          Description = $task.Description
          Author = $task.Author
          Triggers = ($task.Triggers | ForEach-Object { $_.CimClass.CimClassName + ': ' + $_.ToString() })
          Actions = ($task.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments })
          LastRunTime = $info.LastRunTime
          LastTaskResult = $info.LastTaskResult
          NextRunTime = $info.NextRunTime
          NumberOfMissedRuns = $info.NumberOfMissedRuns
        }
      `;
      const result = await runPowerShellJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "scheduler_enable",
    "Enable a scheduled task.",
    {
      taskName: z.string().describe("Task name"),
      taskPath: z.string().optional().describe("Task path"),
    },
    async ({ taskName, taskPath }) => {
      const path = taskPath || "\\";
      await runPowerShell(`Enable-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}'`);
      const result = await runPowerShellJson(`Get-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}' | Select-Object TaskName, State`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "scheduler_disable",
    "Disable a scheduled task.",
    {
      taskName: z.string().describe("Task name"),
      taskPath: z.string().optional().describe("Task path"),
    },
    async ({ taskName, taskPath }) => {
      const path = taskPath || "\\";
      await runPowerShell(`Disable-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}'`);
      const result = await runPowerShellJson(`Get-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}' | Select-Object TaskName, State`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "scheduler_run",
    "Run a scheduled task immediately (on demand).",
    {
      taskName: z.string().describe("Task name"),
      taskPath: z.string().optional().describe("Task path"),
    },
    async ({ taskName, taskPath }) => {
      const path = taskPath || "\\";
      await runPowerShell(`Start-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}'`);
      const result = await runPowerShellJson(`Get-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}' | Select-Object TaskName, State`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "scheduler_create",
    "Create a new scheduled task.",
    {
      taskName: z.string().describe("Task name"),
      taskPath: z.string().optional().describe("Task folder path (default: '\\\\')"),
      description: z.string().optional().describe("Task description"),
      execute: z.string().describe("Program/script to execute"),
      arguments: z.string().optional().describe("Arguments for the program"),
      workingDirectory: z.string().optional().describe("Working directory"),
      triggerType: z.enum(["Daily", "Weekly", "AtStartup", "AtLogon", "Once"]).describe("Trigger type"),
      triggerTime: z.string().optional().describe("Time for the trigger (HH:mm format, e.g. '09:00')"),
      runLevel: z.enum(["Limited", "Highest"]).optional().describe("Run with highest privileges or limited"),
    },
    async ({ taskName, taskPath, description, execute, arguments: args, workingDirectory, triggerType, triggerTime, runLevel }) => {
      const path = taskPath || "\\";
      const parts: string[] = [];

      // Action
      let actionCmd = `$action = New-ScheduledTaskAction -Execute '${execute}'`;
      if (args) actionCmd += ` -Argument '${args}'`;
      if (workingDirectory) actionCmd += ` -WorkingDirectory '${workingDirectory}'`;
      parts.push(actionCmd);

      // Trigger
      let triggerCmd = "$trigger = New-ScheduledTaskTrigger";
      switch (triggerType) {
        case "Daily": triggerCmd += ` -Daily -At '${triggerTime || "09:00"}'`; break;
        case "Weekly": triggerCmd += ` -Weekly -At '${triggerTime || "09:00"}' -DaysOfWeek Monday`; break;
        case "AtStartup": triggerCmd += " -AtStartup"; break;
        case "AtLogon": triggerCmd += " -AtLogon"; break;
        case "Once": triggerCmd += ` -Once -At '${triggerTime || "09:00"}'`; break;
      }
      parts.push(triggerCmd);

      // Settings
      if (runLevel === "Highest") {
        parts.push("$settings = New-ScheduledTaskSettingsSet -RunOnlyIfNetworkAvailable");
        parts.push(`Register-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}' -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest${description ? ` -Description '${description}'` : ""}`);
      } else {
        parts.push(`Register-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}' -Action $action -Trigger $trigger${description ? ` -Description '${description}'` : ""}`);
      }

      const cmd = parts.join("; ");
      await runPowerShell(cmd);
      const result = await runPowerShellJson(`Get-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}' | Select-Object TaskName, TaskPath, State`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "scheduler_delete",
    "Delete a scheduled task.",
    {
      taskName: z.string().describe("Task name"),
      taskPath: z.string().optional().describe("Task path"),
    },
    async ({ taskName, taskPath }) => {
      const path = taskPath || "\\";
      await runPowerShell(`Unregister-ScheduledTask -TaskName '${taskName}' -TaskPath '${path}' -Confirm:$false`);
      return { content: [{ type: "text", text: `Task '${taskName}' deleted successfully.` }] };
    }
  );

  server.tool(
    "scheduler_history",
    "Get execution history of a scheduled task.",
    {
      taskName: z.string().describe("Task name"),
      maxEvents: z.number().min(1).max(100).default(20).describe("Maximum number of history entries"),
    },
    async ({ taskName, maxEvents }) => {
      const cmd = `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TaskScheduler/Operational'; Data='${taskName}'} -MaxEvents ${maxEvents} -ErrorAction SilentlyContinue | Select-Object TimeCreated, Id, Message`;
      try {
        const result = await runPowerShellJson(cmd);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch {
        return { content: [{ type: "text", text: "No history found. The TaskScheduler operational log may be disabled." }] };
      }
    }
  );
}
