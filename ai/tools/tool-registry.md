# Spec Kit Tool Registry

This file is the L4 registry for reusable tools and capabilities. Tools are
available capabilities, not always-on actions. A workflow stage should use a
tool only when its output can provide concrete facts that are needed for the
current decision.

## Output Contract

Automation scripts and structured inspectors must report:

- `facts`: observed data or file-system state.
- `blockers`: hard conditions that prevent safe progress.
- `unknowns`: missing data that the LLM or user must resolve.
- `hints`: non-binding suggestions for the LLM to evaluate.

Scripts must not make final semantic decisions from user natural-language
keywords. The LLM owns semantic routing, root-cause judgment, validation
sufficiency, and tradeoff decisions.

## Capability Types

| Capability | Source | Use For | Boundary |
| --- | --- | --- | --- |
| PowerShell inspectors | `.specify/scripts/**` | Hard facts, changed files, validation candidates, source/runtime consistency | No semantic final decisions |
| Local logs | `<system-temp>/SDKLog\SDK_*.log`, `<system-temp>/ServiceBridgeLog\ServiceBridge_*.log` | Runtime SDK/Biz evidence after the host process exits | Do not require MCP |
| Chrome DevTools MCP | `chrome-devtools` MCP server | DOM, CSS, console, network, screenshots, Electron target state | Read before guessing UI/runtime causes |
| Repository map skill | `.agents/spec-kit/skills/speckit-repository-map` | Repository role and path facts | Do not infer roles by scanning source trees |
| Code simplifier skill | `.agents/spec-kit/skills/code-simplifier` | Post-implementation clarity cleanup | Preserve behavior exactly |
| Commit message skill | `.agents/spec-kit/skills/commit-message` | Team commit message formatting | Use the approved team template only |
| External MCP tools | Client-specific MCP servers such as GitHub or Figma | Source-of-truth artifacts explicitly requested or referenced by the user | Write/destructive actions require explicit human confirmation |

## Runtime Fact Sources

When repeated fixes fail, prefer facts in this order:

1. Structured workflow state and feature artifacts.
2. Local file-system evidence and generated logs.
3. Chrome DevTools MCP for live DOM/CSS/console/runtime state.
4. User-provided DOM/CSS/log excerpts when MCP is unavailable.

Do not keep applying speculative source changes after repeated failures without
collecting runtime facts.
