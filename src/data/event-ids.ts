export interface EventIdInfo {
  id: number;
  source: string;
  description: string;
  commonCauses: string[];
  suggestedFixes: string[];
}

export const EVENT_ID_DATABASE: EventIdInfo[] = [
  {
    id: 7031,
    source: "Service Control Manager",
    description: "A service terminated unexpectedly and a recovery action was triggered.",
    commonCauses: [
      "Service crashed due to unhandled exception",
      "Memory leak causing out-of-memory condition",
      "Dependency service became unavailable",
      "Corrupted service binary or configuration",
    ],
    suggestedFixes: [
      "Check the Application log for related crash events (Event ID 1000)",
      "Review service recovery settings in services.msc",
      "Update or reinstall the affected service",
      "Check for memory leaks using Performance Monitor",
    ],
  },
  {
    id: 7034,
    source: "Service Control Manager",
    description: "A service terminated unexpectedly (no recovery action configured).",
    commonCauses: [
      "Service process crashed or was killed externally",
      "Insufficient system resources (memory, handles)",
      "Conflicting software or antivirus interference",
    ],
    suggestedFixes: [
      "Configure recovery actions for the service",
      "Check Application event log for crash details",
      "Verify sufficient system resources are available",
      "Check for third-party software conflicts",
    ],
  },
  {
    id: 7036,
    source: "Service Control Manager",
    description: "A service changed its state (started, stopped, paused, etc.).",
    commonCauses: [
      "Normal service start/stop operation",
      "System boot or shutdown",
      "Administrative action",
      "Automatic recovery after failure",
    ],
    suggestedFixes: [
      "This is usually informational — no action needed",
      "If unexpected, check who or what initiated the state change",
      "Review Security log for logon events around the same time",
    ],
  },
  {
    id: 7040,
    source: "Service Control Manager",
    description: "The start type of a service was changed.",
    commonCauses: [
      "Administrative configuration change",
      "Windows Update modifying service settings",
      "Group Policy applying new settings",
      "Third-party software or optimizer tools",
    ],
    suggestedFixes: [
      "Verify the change was intentional",
      "Check Security log for the account that made the change",
      "Review Group Policy settings if in a domain environment",
    ],
  },
  {
    id: 41,
    source: "Kernel-Power",
    description: "The system rebooted without cleanly shutting down first (unexpected shutdown/power loss).",
    commonCauses: [
      "Power outage or UPS failure",
      "Hardware failure (PSU, motherboard)",
      "Kernel crash (BSOD) without dump generation",
      "Overheating causing emergency shutdown",
      "Holding power button",
    ],
    suggestedFixes: [
      "Check for BSOD minidumps in C:\\Windows\\Minidump",
      "Verify power supply and UPS functionality",
      "Check CPU/GPU temperatures under load",
      "Update BIOS/UEFI firmware",
      "Run hardware diagnostics (memory, disk)",
    ],
  },
  {
    id: 1001,
    source: "Windows Error Reporting",
    description: "Windows Error Reporting logged a fault bucket for a crashed application.",
    commonCauses: [
      "Application crash (access violation, unhandled exception)",
      "Driver crash",
      "System component failure",
    ],
    suggestedFixes: [
      "Review the fault bucket parameters to identify the crashing module",
      "Update or reinstall the affected application",
      "Check for updated drivers if a driver module is listed",
      "Search Microsoft support for the specific fault bucket signature",
    ],
  },
  {
    id: 6008,
    source: "EventLog",
    description: "The previous system shutdown was unexpected.",
    commonCauses: [
      "Power failure",
      "System crash (BSOD)",
      "Hardware failure",
      "Forced power-off",
    ],
    suggestedFixes: [
      "Correlate with Kernel-Power Event ID 41",
      "Check for BSOD dumps",
      "Verify hardware health (PSU, RAM, disk)",
      "Ensure UPS is functioning if present",
    ],
  },
  {
    id: 4624,
    source: "Microsoft-Windows-Security-Auditing",
    description: "An account was successfully logged on.",
    commonCauses: [
      "User interactive logon",
      "Service account logon",
      "Network logon (SMB, mapped drives)",
      "Scheduled task execution",
      "Remote Desktop connection",
    ],
    suggestedFixes: [
      "This is informational — review Logon Type for context",
      "Type 2 = Interactive, Type 3 = Network, Type 10 = RemoteInteractive",
      "If unexpected, investigate the source IP and account used",
    ],
  },
  {
    id: 4625,
    source: "Microsoft-Windows-Security-Auditing",
    description: "An account failed to log on.",
    commonCauses: [
      "Incorrect password",
      "Account locked out",
      "Expired account or password",
      "Brute force attack attempts",
      "Stale credentials in cached connections",
    ],
    suggestedFixes: [
      "Check Sub Status code for specific failure reason",
      "0xC000006A = bad password, 0xC0000234 = locked out",
      "If repeated from unknown sources, consider blocking the IP",
      "Review account lockout policies",
      "Check for services or tasks using old passwords",
    ],
  },
  {
    id: 4648,
    source: "Microsoft-Windows-Security-Auditing",
    description: "A logon was attempted using explicit credentials (RunAs or network with specified creds).",
    commonCauses: [
      "RunAs command usage",
      "Mapped network drive with explicit credentials",
      "Scheduled task running as different user",
      "Lateral movement in an attack scenario",
    ],
    suggestedFixes: [
      "Verify the source account and target account are expected",
      "If unexpected, investigate for potential credential theft",
      "Review the process that initiated the logon",
    ],
  },
  {
    id: 1000,
    source: "Application Error",
    description: "An application crashed (faulting application).",
    commonCauses: [
      "Access violation or unhandled exception in application code",
      "Corrupted application files",
      "Incompatible DLL or plugin",
      "Memory corruption",
    ],
    suggestedFixes: [
      "Note the faulting module name — update or reinstall it",
      "Run sfc /scannow if a system DLL is involved",
      "Check for application updates",
      "If recurring, consider disabling plugins/add-ons",
    ],
  },
  {
    id: 1002,
    source: "Application Hang",
    description: "An application stopped responding and was closed (hung).",
    commonCauses: [
      "Deadlock in application code",
      "Waiting on unresponsive network resource",
      "Disk I/O bottleneck",
      "Insufficient memory causing excessive paging",
    ],
    suggestedFixes: [
      "Check disk and network health during the time of the hang",
      "Monitor memory usage of the application",
      "Update the application to the latest version",
      "Check if antivirus real-time scanning is interfering",
    ],
  },
  {
    id: 13,
    source: "Microsoft-Windows-Sysmon",
    description: "Sysmon: Registry value was set.",
    commonCauses: [
      "Application configuration change",
      "Malware persistence mechanism (Run keys, services)",
      "System configuration update",
      "Group Policy application",
    ],
    suggestedFixes: [
      "Review the registry path for known persistence locations",
      "Check HKLM\\...\\Run and HKCU\\...\\Run for suspicious entries",
      "Correlate with process creation events (Sysmon ID 1)",
      "If suspicious, scan with updated antimalware tools",
    ],
  },
  {
    id: 3,
    source: "Microsoft-Windows-Sysmon",
    description: "Sysmon: Network connection detected.",
    commonCauses: [
      "Application making outbound network connection",
      "Malware command-and-control communication",
      "System update check",
      "Legitimate service communication",
    ],
    suggestedFixes: [
      "Check the destination IP/port against known threat intelligence",
      "Verify the source process is legitimate",
      "If suspicious, block the IP in firewall and investigate the process",
      "Correlate with DNS query events (Sysmon ID 22)",
    ],
  },
  {
    id: 36874,
    source: "Schannel",
    description: "TLS connection failed — the remote server sent a fatal alert or connection was refused.",
    commonCauses: [
      "TLS version mismatch (client/server don't share a common version)",
      "Expired or invalid server certificate",
      "Cipher suite incompatibility",
      "Certificate revocation check failure",
    ],
    suggestedFixes: [
      "Verify TLS versions enabled on both client and server",
      "Check server certificate validity and chain",
      "Enable TLS 1.2/1.3 if disabled",
      "Review Schannel registry settings for disabled protocols",
    ],
  },
  {
    id: 36888,
    source: "Schannel",
    description: "A fatal alert was generated and sent to the remote endpoint (TLS handshake failure).",
    commonCauses: [
      "Client rejected server certificate",
      "Protocol version negotiation failure",
      "Client certificate required but not provided",
      "Cipher suite negotiation failure",
    ],
    suggestedFixes: [
      "Check the alert code in the event details for specifics",
      "Verify certificate trust chain on the client",
      "Ensure compatible TLS versions are enabled",
      "Check if client certificate is required and properly configured",
    ],
  },
  {
    id: 2004,
    source: "Microsoft-Windows-Windows Firewall With Advanced Security",
    description: "A rule was added to the Windows Firewall exception list.",
    commonCauses: [
      "Application installation adding firewall rule",
      "Administrative action",
      "Malware creating firewall exceptions for persistence",
      "Windows Update adding rules for new features",
    ],
    suggestedFixes: [
      "Review the rule details — verify the application path is legitimate",
      "If unexpected, remove the rule and investigate the source",
      "Audit firewall rules periodically: Get-NetFirewallRule",
      "Check Security log for who made the change",
    ],
  },
  {
    id: 10016,
    source: "Microsoft-Windows-DistributedCOM",
    description: "DCOM permission error — an application attempted to access a DCOM server without proper permissions.",
    commonCauses: [
      "Windows Update changing DCOM component permissions",
      "Third-party application with insufficient DCOM rights",
      "Service account lacking DCOM activation permissions",
      "Known Windows bug with certain system components",
    ],
    suggestedFixes: [
      "Often safe to ignore for known Microsoft CLSIDs",
      "Use dcomcnfg.exe to grant Launch/Activation permissions",
      "Search the CLSID in the event to identify the component",
      "For known Windows bugs, apply latest cumulative updates",
    ],
  },
  {
    id: 7045,
    source: "Service Control Manager",
    description: "A new service was installed on the system.",
    commonCauses: [
      "Legitimate software installation",
      "Windows Update installing a new service",
      "Malware installing a service for persistence",
      "Driver installation",
    ],
    suggestedFixes: [
      "Verify the service name and binary path are legitimate",
      "Check if the installation correlates with known admin activity",
      "If unexpected, investigate the service binary for malware",
      "Review the account used to install the service in Security log",
    ],
  },
  {
    id: 1074,
    source: "User32",
    description: "A process initiated a system shutdown or restart.",
    commonCauses: [
      "User-initiated shutdown/restart",
      "Windows Update reboot",
      "Application requesting restart (e.g., installer)",
      "Scheduled task triggering restart",
    ],
    suggestedFixes: [
      "This is informational — shows who/what initiated the shutdown",
      "Check the process and user fields to identify the initiator",
      "If unexpected, review scheduled tasks and update policies",
    ],
  },
  {
    id: 6005,
    source: "EventLog",
    description: "The Event Log service was started (indicates system boot).",
    commonCauses: [
      "Normal system startup",
      "System recovery after crash",
    ],
    suggestedFixes: [
      "This is informational — marks system boot time",
      "Use to determine when the system last started",
      "If unexpected, check for Event ID 6008 or 41 before this event",
    ],
  },
  {
    id: 6006,
    source: "EventLog",
    description: "The Event Log service was stopped (indicates clean shutdown).",
    commonCauses: [
      "Normal system shutdown",
      "System restart",
    ],
    suggestedFixes: [
      "This is informational — marks clean shutdown time",
      "Absence of this event before a 6005 suggests unexpected shutdown",
      "Use to verify if shutdowns are occurring as scheduled",
    ],
  },
];
