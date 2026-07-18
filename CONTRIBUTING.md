# Contributing to nanoclaw-agenttrace

Thank you for contributing. This repo is the npm package that adds live agent activity traces to [NanoClaw](https://github.com/nanocoai/nanoclaw) installs — it is not the NanoClaw host itself.

## Prerequisites

- Node.js ≥ 20
- pnpm 9

## Branch flow

| Branch | Purpose |
|--------|---------|
| **`develop`** | Integration branch — open feature and fix PRs here |
| **`main`** | Release branch — merge `develop` → `main` to publish |

## Local development

```bash
pnpm install
pnpm run typecheck
pnpm run test:unit
pnpm run build
```

## Monorepo layout

| Path | Role |
|------|------|
| `packages/shared` | Shared types and sanitization (private) |
| `packages/host` | Host-side boot, dispatch, silence keepalives (`type-fixtures/` stubs NanoClaw host modules for standalone `tsc`) |
| `packages/runner` | Container observe / writer (synced into skill) |
| `packages/cli` | `nanoclaw-agenttrace` install CLI |
| `skills/add-agenttrace` | Claude Code `/add-agenttrace` install skill |

## Changesets

User-facing changes to the published `nanoclaw-agenttrace` package need a changeset:

```bash
pnpm changeset
```

See [.changeset/README.md](./.changeset/README.md) for the release flow.
