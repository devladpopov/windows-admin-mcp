# Contributing to windows-admin-mcp

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/windows-admin-mcp.git
   cd windows-admin-mcp
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build:
   ```bash
   npm run build
   ```

## Development

### Project Structure

```
src/
  index.ts              # Entry point, module registration
  config.ts             # Configuration loading
  audit.ts              # Audit logging
  safety.ts             # Confirmation flow, blocklist
  resources.ts          # MCP resources
  utils/
    powershell.ts       # PowerShell execution utilities
  data/
    event-ids.ts        # Event ID knowledge base
  modules/
    services/           # Windows Services management
    events/             # Event Viewer queries
    scheduler/          # Task Scheduler management
    processes/          # Process management
    network/            # Network diagnostics
    diagnostics/        # Multi-step diagnostics
    observability/      # Watch mode, trends
    safety/             # Config, confirm, audit tools
```

### Key Conventions

- All PowerShell string interpolation MUST use `escapePsString()` to prevent injection
- Destructive operations must check `needsConfirmation()` and `checkSafety()`
- Use `runPowerShellJson()` for structured data, `runPowerShellChecked()` for mutations
- Normalize PowerShell single-object-vs-array quirk: `Array.isArray(x) ? x : [x]`
- Return `isError: true` in MCP responses for error conditions

### Running Locally

```bash
# Build and run
npm run build
node dist/index.js

# Or use tsx for development
npm run dev
```

### Testing

```bash
npm test
```

## Submitting Changes

1. Create a branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Ensure the build passes: `npm run build`
4. Run tests: `npm test`
5. Commit with a clear message
6. Push and open a Pull Request

## Adding a New Module

1. Create `src/modules/your-module/index.ts`
2. Export a `registerYourModule(server: McpServer)` function
3. Register tools using `server.tool()`
4. Add to `src/index.ts` with config guard
5. Add module to `ModulesConfig` interface in `src/config.ts`
6. Update README with new tools

## Adding Event ID Entries

Add entries to `src/data/event-ids.ts`:

```typescript
{
  id: 1234,
  source: "Microsoft-Windows-SomeSource",
  description: "What this event means",
  commonCauses: ["Cause 1", "Cause 2"],
  suggestedFixes: ["Fix 1", "Fix 2"],
}
```

## Code of Conduct

Be respectful. Focus on constructive feedback. We're all here to make Windows administration better.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
