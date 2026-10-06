# AGENTS.md

Guidance for coding agents working on **opencode-mem** — a persistent memory plugin for OpenCode (Turso/libSQL vector search, auto-capture, web UI).

## Stack & layout

- Runtime / package manager: **Bun**
- Language: TypeScript (`src/`), Svelte web UI (`web/`)
- Tests: `tests/` via `bun test`
- Plugin entrypoints: `src/plugin.ts`, `src/v2/`, exports in `package.json`

## Commands

```bash
bun install
bun test
bun run typecheck
bun run check          # format + lint + typecheck
bun run build
bun run web:dev        # web UI only
```

Prefer `bun` over `npm`/`npx`. Use `bunx` when a one-off binary is needed.

## Commits — Conventional Commits only

All commits **MUST** follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Allowed types

| Type       | Use for                                   |
| ---------- | ----------------------------------------- |
| `feat`     | New user-facing capability (MINOR)        |
| `fix`      | Bug fix (PATCH)                           |
| `docs`     | Docs / README / comments only             |
| `style`    | Formatting; no logic change               |
| `refactor` | Internal change; no feat/fix              |
| `perf`     | Performance improvement                   |
| `test`     | Tests only                                |
| `build`    | Build system / bundling                   |
| `ci`       | CI workflows / hooks                      |
| `chore`    | Maintenance, deps, release plumbing       |
| `revert`   | Reverts; reference SHAs in `Refs:` footer |

### Rules

- Description: imperative, concise, no trailing period (`fix: harden provider discovery`)
- Scope (optional): area of the change, e.g. `feat(turso):`, `fix(ai):`, `chore(deps):`
- Breaking changes: `!` after type/scope **or** a `BREAKING CHANGE:` footer
- One logical change per commit when practical
- Do **not** invent types outside the table above

Examples from this repo:

```
feat(config): add opencodeVariant for internal LLM calls
fix(v2): refresh connected providers after late host registration
chore(deps): bump the minor-and-patch group across 2 directories
```

## Pull requests

**Cleanest workflow (preferred):** squash-merge. Then only the **PR title** lands on `main` as the commit — so the title **MUST** be a valid Conventional Commit subject (same rules as commits).

| Part     | Format                                                                             |
| -------- | ---------------------------------------------------------------------------------- |
| PR title | Conventional Commit subject (`fix(ai): …`, `feat(turso): …`)                       |
| PR body  | Free-form — use `.github/PULL_REQUEST_TEMPLATE.md` (Summary, Test plan, Checklist) |

- Do **not** put Conventional Commit syntax in the PR body
- Base branch: `main`
- Before opening: `bun test`, `bun run typecheck`, and `bun run check` when code changes
- Update README / docs when behavior or contribution process changes
- If the PR is not squashed and multiple commits merge: **every** commit on the branch must still be Conventional Commits

## Code & review habits

- Match existing patterns in the touched area; avoid drive-by refactors
- Keep diffs focused on the requested change
- Prefer existing libraries and utilities already in the tree
- Do not commit secrets, local data under `data/`, or `node_modules`
- Intel Mac (`darwin/x64`) is unsupported (Turso / onnxruntime bindings)

## When unsure

- Prefer a small, reviewable PR over a large mixed one
- Ask before destructive git operations (`push --force`, hard reset, history rewrite)
- Only commit when explicitly asked
