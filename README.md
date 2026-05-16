# windows-admin-mcp

MCP server for Windows system administration. Manage Services, Event Viewer, and Task Scheduler through any MCP-compatible AI assistant (Claude Desktop, Cursor, Windsurf, etc.).

Unlike general-purpose Windows automation tools, this server focuses specifically on **sysadmin and DevOps workflows**: monitoring services, investigating event logs, and managing scheduled tasks.

## Features

### Services Management
| Tool | Description |
|------|-------------|
| `services_list` | List services with optional status/name filter |
| `services_get` | Get detailed info including dependencies |
| `services_start` | Start a service |
| `services_stop` | Stop a service (with optional force) |
| `services_restart` | Restart a service |
| `services_set_startup` | Change startup type (Automatic, Manual, Disabled) |

### Event Viewer
| Tool | Description |
|------|-------------|
| `events_query` | Query events by log, level, source, time range, keyword |
| `events_logs_list` | List available event logs with record counts |
| `events_sources_list` | List event sources for a specific log |
| `events_summary` | Summary of recent events grouped by level |

### Task Scheduler
| Tool | Description |
|------|-------------|
| `scheduler_list` | List tasks with optional path/state filter |
| `scheduler_get` | Get task details: triggers, actions, last run info |
| `scheduler_enable` | Enable a task |
| `scheduler_disable` | Disable a task |
| `scheduler_run` | Run a task immediately |
| `scheduler_create` | Create a new scheduled task |
| `scheduler_delete` | Delete a task |
| `scheduler_history` | Get task execution history |

## Installation

```bash
npx windows-admin-mcp
```

Or install globally:

```bash
npm install -g windows-admin-mcp
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

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

### Cursor / Windsurf

Add to your MCP settings:

```json
{
  "windows-admin": {
    "command": "npx",
    "args": ["-y", "windows-admin-mcp"]
  }
}
```

### Claude Code

Add to your `.mcp.json`:

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

## Requirements

- Windows 10/11 or Windows Server 2016+
- Node.js 18+
- PowerShell 5.1+ (included with Windows)
- Administrator privileges (for service control and task management)

## Usage Examples

**"Show me all stopped services that normally auto-start"**
```
services_list(status: "Stopped") → then filter by StartType: Automatic
```

**"What errors happened in the last hour?"**
```
events_query(logName: "System", level: "Error", afterTime: "2024-01-15T12:00:00")
```

**"Restart the Print Spooler service"**
```
services_restart(name: "Spooler")
```

**"Create a daily backup task"**
```
scheduler_create(
  taskName: "DailyBackup",
  execute: "powershell.exe",
  arguments: "-File C:\\Scripts\\backup.ps1",
  triggerType: "Daily",
  triggerTime: "02:00",
  runLevel: "Highest"
)
```

## Permissions Note

Some operations require elevated (Administrator) privileges:
- Starting/stopping services
- Creating/deleting scheduled tasks
- Reading Security event logs

Read-only operations (listing services, querying non-Security event logs) work without elevation.

## Roadmap

- [ ] **v0.2**: System module (clipboard, volume, Wi-Fi, Bluetooth)
- [ ] **v0.3**: Media transport controls (play/pause/next)
- [ ] **v0.4**: Notifications center integration
- [ ] **v0.5**: Performance counters and process management
- [ ] **v1.0**: Stable release with full documentation

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

## License

MIT

---

# windows-admin-mcp (RU)

MCP-сервер для администрирования Windows. Управление службами, просмотр событий и планировщик задач через любого MCP-совместимого AI-ассистента (Claude Desktop, Cursor, Windsurf и др.).

В отличие от универсальных инструментов автоматизации Windows, этот сервер фокусируется на **задачах системного администрирования и DevOps**: мониторинг служб, расследование событий, управление расписаниями.

## Возможности

### Управление службами
- `services_list` : список служб с фильтрацией по статусу/имени
- `services_get` : подробная информация включая зависимости
- `services_start` / `services_stop` / `services_restart` : управление жизненным циклом
- `services_set_startup` : изменение типа запуска

### Просмотр событий (Event Viewer)
- `events_query` : запрос событий по журналу, уровню, источнику, времени, ключевому слову
- `events_logs_list` : список доступных журналов
- `events_sources_list` : список источников событий
- `events_summary` : сводка по уровням за последние N часов

### Планировщик задач (Task Scheduler)
- `scheduler_list` / `scheduler_get` : просмотр задач
- `scheduler_enable` / `scheduler_disable` : включение/отключение
- `scheduler_run` : немедленный запуск
- `scheduler_create` / `scheduler_delete` : создание и удаление
- `scheduler_history` : история выполнения

## Установка

```bash
npx windows-admin-mcp
```

## Настройка для Claude Desktop

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

## Требования

- Windows 10/11 или Windows Server 2016+
- Node.js 18+
- PowerShell 5.1+ (включён в Windows)
- Права администратора (для управления службами и задачами)

## Лицензия

MIT
