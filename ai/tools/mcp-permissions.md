# MCP Permissions

This file defines default permission boundaries for L4 tool usage.

## Permission Matrix

| Action | Default | Requirement |
| --- | --- | --- |
| Read DOM/CSS/console/network metadata | Allowed when relevant | Record the facts used |
| Screenshot current target | Allowed when relevant | Avoid unrelated targets |
| Click/type in local validation target | Allowed when needed for validation | Keep action scoped and reversible |
| Read local generated SDK/Biz logs | Allowed when relevant | Use latest matching log after process exit |
| Modify local source files | Use normal source editing workflow | Do not edit runtime artifacts as the only fix |
| Write to external tools or services | Blocked by default | Explicit human confirmation required |
| Delete, move, publish, push, merge, or close external items | Blocked by default | Explicit human confirmation required |
| Access credentials or secrets | Blocked unless explicitly required | Ask the user and minimize exposure |

## Confirmation Rule

Before any write/destructive external MCP action, state the exact action and wait
for explicit human confirmation. Read-only investigation does not need a separate
confirmation when it is directly relevant to the current task.

## Local Logs

Local log reading is not MCP usage and does not require MCP. Known paths:

- SdkConsumer: `<system-temp>/SDKLog\SDK_*.log`
- CoreRuntime Biz: `<system-temp>/ServiceBridgeLog\ServiceBridge_*.log`

Prefer the latest matching file after closing the HostApplication process.
