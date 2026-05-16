import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const POWERSHELL_EXE = process.env.POWERSHELL_EXE || "powershell.exe";

export interface PowerShellResult {
  stdout: string;
  stderr: string;
}

/**
 * Escape a string for safe embedding inside PowerShell single quotes.
 * PowerShell single-quoted strings only need ' doubled to ''.
 */
export function escapePsString(value: string): string {
  return value.replace(/'/g, "''");
}

export async function runPowerShell(command: string): Promise<PowerShellResult> {
  const { stdout, stderr } = await execFileAsync(POWERSHELL_EXE, [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    command,
  ], {
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

export async function runPowerShellChecked(command: string): Promise<string> {
  const { stdout, stderr } = await runPowerShell(command);
  if (stderr) throw new Error(stderr);
  return stdout;
}

export async function runPowerShellJson<T = unknown>(command: string): Promise<T> {
  const { stdout, stderr } = await runPowerShell(`${command} | ConvertTo-Json -Depth 5`);
  if (stderr && !stdout) throw new Error(stderr);
  if (!stdout) return null as unknown as T;
  return JSON.parse(stdout);
}
