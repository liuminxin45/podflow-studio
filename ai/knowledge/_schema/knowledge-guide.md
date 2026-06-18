# Knowledge Guide Schema

Each guide should begin with lightweight metadata:

```yaml
---
authority: generated | reviewed | authoritative
confidence: low | medium | high
source_refs:
  - path-or-command-used-as-evidence
last_verified: YYYY-MM-DD or null
---
```

Authority means:

- `generated`: AI/bootstrap draft. Useful for routing, never final proof.
- `reviewed`: human or maintainer reviewed. Usable as project guidance.
- `authoritative`: backed by source, policy, or owner-approved documentation.

Selectors may load generated guides, but the agent must ground risky decisions in
source evidence or reviewed/authoritative guides.
