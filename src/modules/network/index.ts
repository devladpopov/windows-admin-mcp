import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { escapePsString, runPowerShellJson } from "../../utils/powershell.js";

export function registerNetworkModule(server: McpServer) {
  server.tool(
    "network_ping",
    "Test network connectivity to a host using ICMP ping.",
    {
      host: z.string().describe("Hostname or IP address to ping"),
      count: z.number().min(1).max(20).default(4).describe("Number of ping attempts"),
    },
    async ({ host, count }) => {
      const cmd = `Test-Connection -ComputerName '${escapePsString(host)}' -Count ${Math.floor(count)} -ErrorAction Stop | Select-Object Address, @{N='ResponseTimeMs';E={$_.ResponseTime}}, StatusCode, BufferSize`;

      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: `No response from ${host}.` }] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Ping failed: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "network_check_port",
    "Check if a TCP port is open on a remote host.",
    {
      host: z.string().describe("Hostname or IP address"),
      port: z.number().min(1).max(65535).describe("TCP port number to check"),
    },
    async ({ host, port }) => {
      const cmd = `Test-NetConnection -ComputerName '${escapePsString(host)}' -Port ${Math.floor(port)} -WarningAction SilentlyContinue | Select-Object ComputerName, RemoteAddress, RemotePort, TcpTestSucceeded, @{N='ResponseTimeMs';E={$_.PingReplyDetails.RoundtripTime}}`;

      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: "Connection test returned no result." }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Port check failed: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "network_dns",
    "Perform a DNS lookup for a given name.",
    {
      name: z.string().describe("Domain name to resolve"),
      type: z.enum(["A", "AAAA", "MX", "CNAME", "NS", "TXT", "SOA", "SRV", "PTR"]).optional().describe("DNS record type (default: A)"),
    },
    async ({ name, type }) => {
      let cmd = `Resolve-DnsName -Name '${escapePsString(name)}'`;
      if (type) cmd += ` -Type ${type}`;
      cmd += " -ErrorAction Stop | Select-Object Name, Type, TTL, @{N='Data';E={ if ($_.IPAddress) { $_.IPAddress } elseif ($_.NameExchange) { $_.NameExchange } elseif ($_.NameHost) { $_.NameHost } elseif ($_.Strings) { $_.Strings -join '; ' } else { $_.ToString() } }}";

      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: `No DNS records found for ${name}.` }] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `DNS lookup failed: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "network_connections",
    "List active TCP network connections, optionally filtered by state or port.",
    {
      state: z.enum(["Established", "Listen", "TimeWait", "CloseWait", "All"]).default("All").describe("Filter by connection state"),
      localPort: z.number().optional().describe("Filter by local port number"),
    },
    async ({ state, localPort }) => {
      let cmd = "Get-NetTCPConnection -ErrorAction SilentlyContinue";

      const filters: string[] = [];
      if (state && state !== "All") filters.push(`$_.State -eq '${escapePsString(state)}'`);
      if (localPort !== undefined) filters.push(`$_.LocalPort -eq ${Math.floor(localPort)}`);

      if (filters.length > 0) {
        cmd += ` | Where-Object { ${filters.join(" -and ")} }`;
      }

      cmd += " | Select-Object -First 100 LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess, @{N='ProcessName';E={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}}";

      try {
        const result = await runPowerShellJson(cmd);
        if (!result) return { content: [{ type: "text", text: "No connections found matching the criteria." }] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error listing connections: ${e.message}` }], isError: true };
      }
    }
  );
}
