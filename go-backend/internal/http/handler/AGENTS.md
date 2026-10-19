# BACKEND HTTP HANDLER KNOWLEDGE BASE

**Generated:** Fri Mar 20 2026
**Commit:** f45f960
**Branch:** main
**Tag:** 2.1.9-beta6

## OVERVIEW
HTTP request handlers for FLYX Admin API. Core business logic layer.
**Stack:** Go 1.24, net/http, GORM via Repository pattern.

## STRUCTURE
```
handler/
├── handler.go        # Main Handler struct, login/captcha, job scheduling
├── control_plane.go  # Node control plane API (add/delete/list)
├── federation.go     # Federation/cluster sync API
├── flow_policy.go    # Traffic policy API
├── jobs.go           # Background job management (sync, cleanup)
├── user_mutations.go     # Users and user↔tunnel grants
├── node_mutations.go     # Node CRUD, install, ordering
├── tunnel_mutations.go   # Tunnel CRUD, ports, batch ops
├── tunnel_state.go       # Building/validating tunnel state and chains
├── tunnel_runtime.go     # Pushing tunnels to nodes (chains, services, dial addresses)
├── federation_runtime.go # Federation runtime apply/cleanup
├── forward_mutations.go  # Forward CRUD, pause/resume, batch ops, forward ports
├── group_mutations.go    # Groups, permissions, speed limits
├── request_helpers.go    # Request-body parsing helpers, batch results
└── upgrade.go        # System upgrade API
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| **User/Tunnel/Forward CRUD** | `*_mutations.go` | One file per resource; tunnel runtime in `tunnel_runtime.go` |
| **Login/Captcha** | `handler.go` | Login flow, captcha verification |
| **Federation Sync** | `federation.go` | Panel-to-panel sync |
| **Traffic Policies** | `flow_policy.go` | Flow limiting, quota management |
| **Background Jobs** | `jobs.go` | Scheduled sync/cleanup tasks |
| **Node Control** | `control_plane.go` | Node add/delete/list operations |

## CONVENTIONS
- Inherits from parent: GORM via Repository pattern, JWT in Authorization header.
- Keep files per domain; split a file when it grows past ~1500 lines instead of adding to a catch-all.
- Uses `repo.Repository` for DB access via `h.repo.XXX()` methods.
- Handlers never call `repo.DB()` directly — all queries go through Repository methods.
- Domain-driven file split: one file per functional area (federation, jobs, etc.).

## ANTI-PATTERNS
- Do NOT let handlers call `repo.DB()` directly — add a Repository method instead.
- Do NOT change handler signatures without updating router.go.

## COMMANDS
```bash
cd go-backend
go test ./internal/http/handler/...
```
