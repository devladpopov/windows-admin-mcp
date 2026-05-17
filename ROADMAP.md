# windows-admin-mcp — Strategic Roadmap

## Vision

From "PowerShell wrapper" to "AI SRE Agent for Windows".

Two parallel tracks:
- **Track A (MCP):** windows-admin-mcp with intelligent tools, analytics, multi-step diagnostics
- **Track B (CLI):** standalone CLI tools (winlog, wintask, winproc) usable without AI. MCP server uses them under the hood. Shared codebase, two audiences.

## Current State (v0.1.0)

3 modules, 18 tools: services, events, scheduler.
Status: "debug tool, not a daily driver" (user feedback).

## Phase 1: Daily Driver (v0.2)

Goal: cover baseline sysadmin needs so people actually use it every day.

### New modules

**processes**
- `processes_list` — list with sort by CPU/RAM, filter by name
- `processes_get` — detailed info (PID, CPU, RAM, path, start time)
- `processes_kill` — kill by name or PID (with confirmation flow)
- `processes_ports` — which process holds which port (netstat mapping)

**network**
- `network_ping` — Test-Connection to host
- `network_check_port` — TCP port check (host + port)
- `network_dns` — Resolve-DnsName lookup
- `network_connections` — active connections (netstat equivalent)

**events (upgrade)**
- `events_explain` — given Event ID + source, return: description, common causes, suggested fix. Built-in knowledge base of ~100 frequent Windows Event IDs.

### Track B (CLI foundation)
- Extract PowerShell logic into `src/core/` shared between MCP tools and future CLI
- Architecture: `core/` (pure logic) → `modules/` (MCP wrappers) + `cli/` (future)

## Phase 2: Intelligence Layer (v0.3)

Goal: transition from "tool collection" to "thinking system".

**diagnose tool**
- `diagnose_service` — "why is X not working?" runs chain:
  1. Check service status
  2. Check port if applicable
  3. Query recent errors from Event Viewer
  4. Check dependencies
  5. Return structured summary with root cause hypothesis

**system_health**
- Single call: CPU/RAM/disk overview + top 5 processes + recent errors + stopped auto-start services

**bulk operations**
- `services_bulk` — restart/stop all matching pattern
- `scheduler_bulk` — enable/disable all matching pattern

## Phase 3: Safety & Audit (v0.4)

Goal: make it usable on production servers, not just local dev machines.

**Configuration**
- `config.json` with allowlist/blocklist of operations
- Per-module enable/disable
- Max processes to kill, max events to return

**Confirmation flow**
- Destructive actions (kill, delete task, stop service) return preview
- Require explicit confirm tool call before execution

**Audit log**
- JSON log of all operations: timestamp, tool, params, result, user
- Configurable path, rotation

## Phase 4: Observability (v0.5)

Goal: proactive monitoring, not just reactive queries.

**Watch mode**
- `events_watch` — poll for new Critical/Error events, return delta
- `services_watch` — alert when auto-start service stops

**Change detection**
- "What changed in the last hour?" — new services, tasks, processes

**Trend analysis**
- Error rate trending (growing/shrinking)
- Service restart frequency

## Phase 5: AI SRE Agent (v1.0)

Goal: stable, documented, community-driven.

- Stable API with semver guarantees
- MCP resources (system info, health status as context)
- Full documentation with real-world scenarios
- Community contribution guidelines
- Track B: CLI tools published as separate npm packages

## Track B: CLI Tools (parallel, starting Phase 2)

Standalone CLI tools for Windows admins who don't use AI:

```
winlog — Event Viewer replacement
  winlog query --level Error --last 1h
  winlog explain 7031
  winlog summary --last 24h
  winlog watch --level Critical

wintask — Task Scheduler replacement  
  wintask list --state Ready
  wintask create --name Backup --daily 02:00 --exec backup.ps1
  wintask history MyTask
  wintask bulk disable "Adobe*"

winproc — Process manager
  winproc top --sort cpu
  winproc ports
  winproc kill --port 3000
```

These CLIs use the same `core/` modules as MCP server.
Separate npm packages, cross-linked in README.

## Anti-goals

- No filesystem operations (Anthropic's filesystem MCP exists)
- No GUI (the AI assistant IS the interface)  
- No monetization before 500+ GitHub stars
- No alerting/ML patterns before v1.0

## Key Metrics

- GitHub stars
- npm weekly downloads
- Number of tools
- User feedback quality
