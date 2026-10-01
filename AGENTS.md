# AGENTS.md — Instructions for AI Agents (Pi-Agent)

## 1. Project goal

Build an **OpenCode v2 plugin** (`allowlist-gate`, package `opencode-allowlist-plugin`) that enforces an **applicative** gate over dispositive operations — file modifications and active interactions with external services (git push, npm publish, remote commands, etc.). When such an operation is attempted, OpenCode must ask the user whether to proceed. This decision is enforced by the application (native TUI permission dialog), never delegated to the model.

## 2. Stack and technical constraints

- **Language: plain JavaScript (ESM, `"type": "module"`)**. No TypeScript, no build step: OpenCode loads `.js` files directly.
- **npm** for dependency management. Single runtime dependency: `@opencode/plugin` (Promise API).
- Tests with Node's native runner (`node --test`), zero external test frameworks. Cover important/critical behavior without over-testing.
- For any doubt about OpenCode v2 APIs, consult `source_app/opencode` first (read-only reference checkout — never modify it) and the MCP docs (`opencode` library).

## 3. Project structure

```
src/
  index.js    → real entrypoint (Plugin.define + setup(ctx)): single permission.evaluate hook
  policy.js   → pure allowlist/denylist matching (no external dependencies)
  config.js   → configuration resolution (ctx.options + env), no file persistence
index.js      → ROOT ENTRYPOINT (`export { default } from "./src/index.js"`). OpenCode resolves plugins referenced by local path by looking for an index.*/server.* file at the root — it does NOT read package.json's `exports` in that case. Do not remove it.
test/
  policy.test.js      → pure matching: shell params, compound commands, redirections, edit paths, monads, MCP per-server, deny-wins, safe passthrough, external_directory
  config.test.js      → options/env resolution
  plugin.test.js      → hook registration and allow/ask/deny effects, using the real Plugin.define
  resolution.test.js  → replicates OpenCode's real Host.resolve/Host.load against the plugin folder
scripts/
  install.sh    → symlinks the plugin into ~/.config/opencode/plugins (global auto-discovery)
  uninstall.sh  → removes that symlink
```

`source_app/opencode/` is **read-only reference material**: never modify it.

## 4. Architecture

Single hook: `ctx.permission.hook("evaluate", ...)` (see `source_app/opencode/packages/core/src/permission.ts`). Setting `event.effect` drives the native `permission.asked` TUI dialog:

- allowlist match → `allow` (passes silently)
- denylist match → `deny` (blocked; the model receives a warning via `BlockedError`)
- anything else gated → `ask` (blocks until the user replies once/always/reject)

Rule syntax is `scope:pattern` with core-like wildcards (`*`, `?`):

- `shell:<pattern>` — matched against the command text, parameters included (`shell:git pull *` passes, `shell:git push *` asks). OpenCode reports compound commands as one resource per sub-command: allow requires **every** resource to match an allow rule, deny triggers on **any** match (never use `some` for allow — `git status && git push` would slip through).
- `edit:<pattern>` — covers `edit`+`write`+`patch` (they share permission action `edit`), matched against the file resource.
- `mcp:<server>` — per-server, never per-action, wildcards allowed: core always asserts MCP tools with resources `["*"]` (`source_app/opencode/packages/core/src/tool/mcp.ts`), so matching is on the action-name prefix `<server>_` (server name sanitized like core's `namespace()`).
- `webfetch`, `websearch` — monads: whole-action only, no per-URL/query specialization; they ask by default.
- A rule without `:` means whole-action (e.g. `webfetch`).

Precedence: **deny wins over allow, allow wins over ask.** Read-only tools (`grep`, `glob`, `question`, `read`) are never touched. Unmapped gated actions ask.

Outside-project operations always ask, no matter the command: the core asserts `external_directory` before every tool-specific check for targets outside the project folder, and this plugin never allowlists that action (solution A — only the denylist can hard-block it).

The gate re-evaluates every request, so the `always` reply (stored by core in its saved rules) never bypasses it: `always` behaves like `once`. The allowlist is the only persistence mechanism.

Shell redirections always ask: the redirect is part of the resource text of the command it belongs to (`shell/parse.ts`, `redirected_statement`), so an allowlisted command could otherwise write files silently. Any `>` in a `shell` resource forces `ask` (deliberately coarse, quoted `>` and `2>&1` included); deny still wins. Known gap (documented in README): absolute outside paths inside an in-project command are not detectable from the hook.

Global-with-local-override: the plugin is declared by absolute path in `opencode.json`, globally then per-project with the same `package` string — OpenCode applies the last entry, which **replaces** options wholesale (local config must repeat full lists). Never combine a discovery symlink and an explicit entry for the same plugin: it loads twice under one `id` and the second fails as duplicate.

## Packaging (npm)

`package.json` publishes only `index.js`, `src` and `scripts` (plus README/LICENSE, always included); `prepublishOnly` runs the tests. For npm installs OpenCode resolves `<name>/server`, then `<name>` → `exports["."]` (`./src/index.js`); the root `index.js` serves local-path installs only. Check the tarball with `npm pack --dry-run`. `repository`/`homepage`/`bugs` are deliberately unset until the GitHub URL is known. Publishing itself is the user's command.

## 5. Operating rules

- **Stay inside this folder.** Never edit files outside it — no `~/.config/opencode/opencode.json`, no server restart (`opencode service restart` kills the agent session), no `opencode` binary runs. If something outside is needed, stop and describe the exact steps for the user instead.
- **Never perform operations against external accounts/services** (npm publish/login, git remote push/tag, gcloud, or similar). Preparing and verifying up to that point (dry-runs, tests, diffs) is fine; the final authenticated/external command is the user's.
- **Clean, lean, well-documented code**: comments only where behavior isn't obvious (see `src/policy.js` for the MCP/matching rules). Keep pure, testable logic (`policy.js`, `config.js`) separate from the plugin entrypoint (`src/index.js`).
- Verify through execution: run `npm test` after every implementation change.
- On doubt: stop, document what is unclear, and ask. Consult `source_app/opencode` and MCP docs before guessing.

## 6. Documentation languages

- `README.md` and `AGENTS.md` in **English**.
- `MEMORY.md` in **Italian** (working log; also useful if the session gets compacted).
