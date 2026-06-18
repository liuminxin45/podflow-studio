# Architecture Constraints

This file is L0 long-term governance for compatibility boundaries and
cross-layer ownership. It is intentionally stable and human-reviewed.

## Compatibility Boundaries

Treat these as first-class compatibility boundaries:

- Public SDK headers.
- `NativePlugin` / `ServiceBridge` bridge contracts.
- HostApplication plugin APIs.
- Frontend plugin state/events.
- Serialized fields, device status values, and operation permission semantics.

Any breaking change must be explicit in `spec.md` and `plan.md`, with impact,
migration notes, and validation evidence.

## Runtime Truth Boundary

- Preserve real SDK, cache, device, transport, handle, permission, and runtime
  state.
- Fake status, placeholder handles, or optimistic UI state are allowed only in a
  documented virtual or simulation boundary.
- Events are refresh triggers, not durable truth stores.

## Biz / Libs / Frontend Ownership

- `ServiceBridge` is forwarding-only. It must not implement business rules,
  device-state inference, permission decisions, UI behavior calculation, or
  durable runtime truth.
- `CoreRuntime` owns reusable non-UI runtime facts, permission/capability
  facts, identity rules, and reusable business logic.
- Frontend plugins own UI-specific structure, order, visible/enabled
  presentation, and action-entry composition based on facts received through
  the bridge.

## Device Identity

- Cross-boundary device identity is UUID decimal string only.
- C++ internals may use `uint64_t uuid`; public bridge/UI contracts must not
  introduce parallel identities such as `deviceIndex`, `deviceId`, `handleId`,
  or `virtualDeviceId`.
- UUID generation belongs to `device::identity::generateUUID()`.
- Frontend business operations use `node.uuid` only. `node.id` is a UI tree node
  identity.

## File Ownership

- Before adding interface, DTO, permission model, UI display model, adapter, or
  serialization code, search existing ownership locations and adjacent modules.
- If no suitable owner exists, create focused files with clear responsibility
  instead of growing unrelated files.
