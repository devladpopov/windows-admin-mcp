import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PowerShellResult {
  stdout: string;
  stderr: string;
}

export async function runPowerShell(command: string): Promise<PowerShellResult> {
  const { stdout, stderr } = await execFileAsync("powershell.exe", [
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

export async function runPowerShellJson<T = unknown>(command: string): Promise<T> {
  const { stdout } = await runPowerShell(`${command} | ConvertTo-Json -Depth 5`);
  if (!stdout) return [] as unknown as T;
  return JSON.parse(stdout);
}
