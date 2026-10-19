# AGENTS

FLYX — traffic forwarding panel: Go admin API + Vite/React UI + Go agent.

## Structure

| Dir | Role | Entry |
|-----|------|-------|
| `go-backend/` | Admin API (GORM + SQLite/PG, net/http) | `cmd/paneld/main.go` |
| `go-gost/` | Forwarding agent (forked GOST) | `main.go` |
| `go-gost/x/` | Protocol handlers/dialers/listeners (own module) | — |
| `vite-frontend/` | React dashboard (shadcn bridge + Tailwind v4) | `src/App.tsx` |
| `doc/` | User docs (VitePress, deployed to GitHub Pages) | `.vitepress/config.mts` |

`go-gost/go.mod` uses `replace github.com/go-gost/x => ./x`.

## Commands

```bash
# Backend
(cd go-backend && go run ./cmd/paneld)        # SERVER_ADDR defaults to :6365
(cd go-backend && make build)
(cd go-backend && go test ./...)

# Frontend
(cd vite-frontend && pnpm install)
(cd vite-frontend && pnpm run dev)             # host 0.0.0.0:3000
(cd vite-frontend && pnpm run build)           # tsc && vite build
(cd vite-frontend && pnpm run lint)            # eslint --fix (no typecheck command)

# Agent
(cd go-gost && go run .)

# Docs
(cd doc && npm ci && npm run dev)            # npm run build -> doc/.vitepress/dist
```

## Conventions

- **Auth**: raw JWT in `Authorization` header — **no `Bearer` prefix** (both frontend and backend).
- **API envelope**: all responses `{code, msg, data, ts}` (code 0 = success).
- **Frontend UI**: import from `src/shadcn-bridge/heroui/*`, never `@heroui/*` or `@nextui-org/*`.
- **Tailwind theme**: `globals.css` must import `tailwind-theme.pcss` or semantic classes break.
- **Backend DB**: handlers use Repository methods, never `repo.DB()` directly.
- **GORM models**: always define `TableName()` (GORM pluralizes by default).
- **GORM tags**: no `type:jsonb` or `type:serial` (SQLite incompatible).
- **Commits**: no `Co-Authored-By: Claude …` trailer — the owner doesn't want Claude listed as a contributor.
- **Go versions**: `go.mod` says 1.25.0 for all three modules; CI builds with 1.23.

## Anti-patterns

- `install.sh` / `panel_install.sh`: `REPO` must stay `kure29/flyx` (this repo is independent of upstream; don't sync it back). The release job rewrites `REPO`, the version and `PINNED_VERSION` in the release copies, so don't hand-edit those for a release.
- Don't edit `go-gost/x/internal/util/grpc/proto/*.pb.go` (generated).
- Don't add frontend tests (no Vitest/Jest configured).
- Don't reintroduce `@heroui/*` or `@nextui-org/*` packages.

## Testing

- Backend: `(cd go-backend && go test ./...)` — includes contract tests in `tests/contract/`.
- Frontend: no test infrastructure.
- CI runs one PostgreSQL contract test: env var `FLVX_POSTGRES_TEST_DSN`.

## Build quirks

- `vite-frontend` uses `rolldown-vite` (Rust bundler), not standard Vite.
- `vite.config.ts`: `minify: false`, `treeshake: false` (debugging mode).
- CI builds `go-gost` with `CGO_ENABLED=0` then compresses with UPX `--best --lzma`.
