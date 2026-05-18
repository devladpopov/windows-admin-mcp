# windows-admin-mcp

<p align="center">
  <img src="assets/hero-en.jpg" alt="42 Tools for Windows Administration" width="700">
</p>

AI SRE Agent for Windows. An MCP server that gives AI assistants (Claude Desktop, Cursor, Windsurf, Claude Code) the ability to manage, monitor, and diagnose Windows systems.

Not just a PowerShell wrapper: includes multi-step diagnostics, trend analysis, safety controls, and audit logging.

**42 tools** across **8 modules** + **3 MCP resources**.

## Quick Start

Interactive setup — detects your MCP clients and configures them automatically:

```bash
npx windows-admin-mcp --setup
```

Or configure manually — add to your client's config:

### Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "windows-admin": {
      "command": "npx",
      "args": ["-y", "windows-admin-mcp"]
    }
  }
}
```

### Cursor / VS Code / Windsurf

Add to your MCP config (`.cursor/mcp.json`, `.vscode/mcp.json`, etc.):

```json
{
  "servers": {
    "windows-admin": {
      "command": "npx",
      "args": ["-y", "windows-admin-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add windows-admin npx -y windows-admin-mcp
```

## Modules

### Services (6 tools)
| Tool | Description |
|------|-------------|
| `services_list` | List services with optional status/name filter |
| `services_get` | Get detailed info including dependencies |
| `services_start` | Start a service |
| `services_stop` | Stop a service (confirmation required) |
| `services_restart` | Restart a service (confirmation required) |
| `services_set_startup` | Change startup type (Automatic, Manual, Disabled) |

### Event Viewer (5 tools)
| Tool | Description |
|------|-------------|
| `events_query` | Query events by log, level, source, time range, keyword |
| `events_logs_list` | List available event logs with record counts |
| `events_sources_list` | List event sources for a specific log |
| `events_explain` | Explain Event ID: description, causes, fixes (built-in KB) |
| `events_summary` | Summary of recent events grouped by level |

### Task Scheduler (8 tools)
| Tool | Description |
|------|-------------|
| `scheduler_list` | List tasks with optional path/state filter |
| `scheduler_get` | Get task details: triggers, actions, last run info |
| `scheduler_enable` | Enable a task |
| `scheduler_disable` | Disable a task |
| `scheduler_run` | Run a task immediately |
| `scheduler_create` | Create a new scheduled task |
| `scheduler_delete` | Delete a task (confirmation required) |
| `scheduler_history` | Get task execution history |

### Processes (4 tools)
| Tool | Description |
|------|-------------|
| `processes_list` | List processes sorted by CPU/Memory/Name |
| `processes_get` | Detailed process info (CPU, memory, path, threads) |
| `processes_kill` | Kill a process by name or PID (confirmation + blocklist) |
| `processes_ports` | Which process holds which TCP port |

### Network (4 tools)
| Tool | Description |
|------|-------------|
| `network_ping` | ICMP ping to a host |
| `network_check_port` | Check if a TCP port is open on a remote host |
| `network_dns` | DNS lookup (A, AAAA, MX, CNAME, NS, TXT, etc.) |
| `network_connections` | List active TCP connections with process info |

### Diagnostics (4 tools)
| Tool | Description |
|------|-------------|
| `diagnose_service` | Multi-step diagnosis: status, port, errors, deps, hypothesis |
| `system_health` | Full health overview: CPU, RAM, disk, top processes, errors |
| `services_bulk` | Bulk start/stop/restart services by pattern (with limits) |
| `scheduler_bulk` | Bulk enable/disable tasks by pattern (with limits) |

### Observability (5 tools)
| Tool | Description |
|------|-------------|
| `events_watch` | Poll for new Critical/Error events (delta only, watermark) |
| `services_watch` | Detect auto-start services that are stopped |
| `system_changes` | What changed in last N hours (new services, tasks, state) |
| `error_trends` | Error rate trend analysis (growing/shrinking/stable) |
| `service_restarts` | Service restart frequency, crash detection |

### Safety & Audit (6 tools)
| Tool | Description |
|------|-------------|
| `config_get` | View current safety/audit configuration |
| `config_reload` | Reload config from file |
| `confirm_action` | Confirm a pending destructive action |
| `pending_actions` | List pending confirmations |
| `cancel_action` | Cancel a pending action |
| `audit_query` | Query the audit log |

### MCP Resources
| Resource | URI | Description |
|----------|-----|-------------|
| System Info | `system://info` | OS, CPU, RAM, uptime, hostname |
| System Health | `system://health` | Live health status with overall rating |
| Services Summary | `system://services` | Service counts by status and startup type |

## Safety Features

Destructive operations (`kill`, `stop`, `restart`, `delete`, `bulk`) are protected:

- **Confirmation flow**: Returns a preview + `confirmationId`. Call `confirm_action` to proceed.
- **Blocklist**: Critical processes (`lsass`, `csrss`, `svchost`, `winlogon`, etc.) are blocked by default.
- **Bulk limits**: Maximum 20 operations per bulk call (configurable).
- **Audit log**: All operations logged to JSONL file with timestamps.

Disable confirmation for trusted environments:
```json
{
  "safety": {
    "requireConfirmation": false
  }
}
```

## Configuration

Create a `config.json` next to the installed package, or set `WINDOWS_ADMIN_MCP_CONFIG` env var:

```json
{
  "modules": {
    "services": true,
    "events": true,
    "scheduler": true,
    "processes": true,
    "network": true,
    "diagnostics": true,
    "safety": true,
    "observability": true
  },
  "safety": {
    "requireConfirmation": true,
    "confirmationTimeoutMs": 300000,
    "blocklist": ["lsass", "csrss", "svchost", "winlogon", "smss"],
    "allowlist": []
  },
  "limits": {
    "maxProcessesToKill": 5,
    "maxEventsToReturn": 500,
    "maxBulkOperations": 20
  },
  "audit": {
    "enabled": true,
    "path": "./windows-admin-mcp-audit.jsonl",
    "maxSizeMB": 50
  }
}
```

## Usage Examples

**"Why is SQL Server not working?"**
```
diagnose_service(name: "MSSQLSERVER", port: 1433)
```
Runs 4-step chain: service status, port check, recent errors, dependencies. Returns hypothesis.

**"Is the system healthy?"**
```
system_health()
```
Single call: CPU, RAM, disk, top processes, recent errors, stopped auto-start services.

**"Are errors increasing?"**
```
error_trends(logName: "System", hours: 24)
```
Hourly breakdown with trend (growing/shrinking/stable), top sources, top event IDs.

**"What changed in the last hour?"**
```
system_changes(hours: 1)
```
New services installed, service state changes, new scheduled tasks.

**"Kill the process on port 3000"**
```
processes_ports(port: 3000)     # Find the process
processes_kill(pid: 12345)      # Returns confirmationId
confirm_action(confirmationId: "...")  # Execute
```

## Requirements

- Windows 10/11 or Windows Server 2016+
- Node.js 18+
- PowerShell 5.1+ (included with Windows)
- Administrator privileges (for service control and some event logs)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT

---

# windows-admin-mcp (RU)

<p align="center">
  <img src="assets/hero-ru.jpg" alt="42 инструмента для Windows-администрирования" width="700">
</p>

AI SRE агент для Windows. MCP-сервер, позволяющий AI-ассистентам управлять, мониторить и диагностировать Windows.

Не просто обертка над PowerShell: многошаговая диагностика, анализ трендов, система безопасности, аудит.

**42 инструмента**, **8 модулей**, **3 MCP-ресурса**.

## Быстрый старт

Автоматическая настройка — определяет установленные MCP-клиенты и конфигурирует их:

```bash
npx windows-admin-mcp --setup
```

Или вручную — добавьте в конфиг Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "windows-admin": {
      "command": "npx",
      "args": ["-y", "windows-admin-mcp"]
    }
  }
}
```

## Модули

- **Services** (6): управление службами Windows
- **Event Viewer** (5): запросы, объяснение Event ID, сводки
- **Task Scheduler** (8): полное управление планировщиком
- **Processes** (4): список, детали, kill, порты
- **Network** (4): ping, порты, DNS, соединения
- **Diagnostics** (4): diagnose_service, system_health, bulk-операции
- **Observability** (5): watch mode, обнаружение изменений, тренды ошибок
- **Safety & Audit** (6): конфигурация, подтверждение, аудит

## Безопасность

- Деструктивные операции требуют подтверждения через `confirm_action`
- Критические процессы (lsass, csrss, svchost) в блок-листе
- Лимит на массовые операции (20 по умолчанию)
- Все действия логируются в JSONL-файл

## Лицензия

MIT
