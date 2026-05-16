import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { escapePsString, runPowerShellChecked, runPowerShellJson } from "../../utils/powershell.js";

export function registerSchedulerModule(server: McpServer) {
  server.tool(
    "scheduler_list",
    "List scheduled tasks. Optionally filter by path or state.",
    {
      taskPath: z.string().optional().describe("Task folder path (e.g. '\\Microsoft\\Windows\\' or '\\')"),
      state: z.enum(["Ready", "Running", "Disabled", "All"]).optional().describe("Filter by task state"),
    },
    async ({ taskPath, state }) => {
      let cmd = "Get-ScheduledTask";
      if (taskPath) cmd += ` -TaskPath '${escapePsString(taskPath)}'`;
      if (state && state !== "All") cmd += ` | Where-Object { $_.State -eq '${escapePsString(state)}' }`;
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
      taskPath: z.string().optional().describe("Task path (default: '\\')"),
    },
    async ({ taskName, taskPath }) => {
      const name = escapePsString(taskName);
      const path = escapePsString(taskPath || "\\");
      const cmd = `
        $task = Get-ScheduledTask -TaskName '${name}' -TaskPath '${path}'
        $info = Get-ScheduledTaskInfo -TaskName '${name}' -TaskPath '${path}'
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
      if (!result) return { content: [{ type: "text", text: `Task '${taskName}' not found.` }], isError: true };
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
      const name = escapePsString(taskName);
      const path = escapePsString(taskPath || "\\");
      await runPowerShellChecked(`Enable-ScheduledTask -TaskName '${name}' -TaskPath '${path}'`);
      const result = await runPowerShellJson(`Get-ScheduledTask -TaskName '${name}' -TaskPath '${path}' | Select-Object TaskName, State`);
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
      const name = escapePsString(taskName);
      const path = escapePsString(taskPath || "\\");
      await runPowerShellChecked(`Disable-ScheduledTask -TaskName '${name}' -TaskPath '${path}'`);
      const result = await runPowerShellJson(`Get-ScheduledTask -TaskName '${name}' -TaskPath '${path}' | Select-Object TaskName, State`);
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
      const name = escapePsString(taskName);
      const path = escapePsString(taskPath || "\\");
      await runPowerShellChecked(`Start-ScheduledTask -TaskName '${name}' -TaskPath '${path}'`);
      const result = await runPowerShellJson(`Get-ScheduledTask -TaskName '${name}' -TaskPath '${path}' | Select-Object TaskName, State`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "scheduler_create",
    "Create a new scheduled task.",
    {
      taskName: z.string().describe("Task name"),
      taskPath: z.string().optional().describe("Task folder path (default: '\\')"),
      description: z.string().optional().describe("Task description"),
      execute: z.string().describe("Program/script to execute"),
      arguments: z.string().optional().describe("Arguments for the program"),
      workingDirectory: z.string().optional().describe("Working directory"),
      triggerType: z.enum(["Daily", "Weekly", "AtStartup", "AtLogon", "Once"]).describe("Trigger type"),
      triggerTime: z.string().optional().describe("Time for the trigger (HH:mm format, e.g. '09:00'). Required for Daily, Weekly, Once."),
      daysOfWeek: z.string().optional().describe("Days of week for Weekly trigger (e.g. 'Monday,Wednesday,Friday')"),
      runLevel: z.enum(["Limited", "Highest"]).optional().describe("Run with highest privileges or limited"),
    },
    async ({ taskName, taskPath, description, execute, arguments: args, workingDirectory, triggerType, triggerTime, daysOfWeek, runLevel }) => {
      const parts: string[] = [];

      // Action
      let actionCmd = `$action = New-ScheduledTaskAction -Execute '${escapePsString(execute)}'`;
      if (args) actionCmd += ` -Argument '${escapePsString(args)}'`;
      if (workingDirectory) actionCmd += ` -WorkingDirectory '${escapePsString(workingDirectory)}'`;
      parts.push(actionCmd);

      // Trigger
      const time = escapePsString(triggerTime || "09:00");
      let triggerCmd = "$trigger = New-ScheduledTaskTrigger";
      switch (triggerType) {
        case "Daily": triggerCmd += ` -Daily -At '${time}'`; break;
        case "Weekly": triggerCmd += ` -Weekly -At '${time}' -DaysOfWeek ${escapePsString(daysOfWeek || "Monday")}`; break;
        case "AtStartup": triggerCmd += " -AtStartup"; break;
        case "AtLogon": triggerCmd += " -AtLogon"; break;
        case "Once": triggerCmd += ` -Once -At '${time}'`; break;
      }
      parts.push(triggerCmd);

      // Register
      const escapedName = escapePsString(taskName);
      const escapedPath = escapePsString(taskPath || "\\");
      let registerCmd = `Register-ScheduledTask -TaskName '${escapedName}' -TaskPath '${escapedPath}' -Action $action -Trigger $trigger`;
      if (runLevel === "Highest") registerCmd += " -RunLevel Highest";
      if (description) registerCmd += ` -Description '${escapePsString(description)}'`;
      parts.push(registerCmd);

      const cmd = parts.join("; ");
      await runPowerShellChecked(cmd);
      const result = await runPowerShellJson(`Get-ScheduledTask -TaskName '${escapedName}' -TaskPath '${escapedPath}' | Select-Object TaskName, TaskPath, State`);
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
      const name = escapePsString(taskName);
      const path = escapePsString(taskPath || "\\");
      await runPowerShellChecked(`Unregister-ScheduledTask -TaskName '${name}' -TaskPath '${path}' -Confirm:$false`);
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
      const cmd = `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TaskScheduler/Operational'; Data='${escapePsString(taskName)}'} -MaxEvents ${Math.floor(maxEvents)} -ErrorAction SilentlyContinue | Select-Object TimeCreated, Id, Message`;
      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: "No history found. The TaskScheduler operational log may be disabled." }] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error querying history: ${e.message}` }], isError: true };
      }
    }
  );
}
