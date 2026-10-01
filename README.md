# opencode-allowlist-plugin

An **OpenCode v2** plugin that puts dispositive operations under applicative control: file modifications and active interactions with external services (git push, npm publish, remote commands, …) require user approval through OpenCode's **native permission dialog** — never through a model decision.

- **Allowlist** → passes without asking
- **Denylist** (a second allowlist) → blocked, the model gets a warning (`deny`)
- **Unmapped** (gated actions) → asked (`ask`, blocks until you reply)
- Read-only tools (`grep`, `glob`, `question`, `read`) → never touched

## Rule syntax: `scope:pattern`

Rules use core-like wildcards (`*`, `?`):

- `shell:<pattern>` — matched against the command text, parameters included. Example: `shell:git pull *` passes while `shell:git push *` asks. Compound commands (`a && b`, pipes, `$(...)`) are split by OpenCode into one resource per sub-command: the operation is allowed only if **every** sub-command is allowlisted, and denied if **any** matches the denylist.
- `edit:<pattern>` — covers `edit`+`write`+`patch` (they share the `edit` permission action), matched against the file resource. Example: `edit:docs/*`.
- `mcp:<server>` — per-server, never per-action; wildcards allowed. Example: `mcp:docs-mcp-server` allows the whole docs server while a DB server not listed asks; `mcp:docs-*` allows every server starting with `docs-`. (Core always asserts MCP tools with resources `["*"]`, so matching is done on the action-name prefix `<server>_`.)
- `webfetch`, `websearch` — monads: whole-action only, no per-URL/query specialization. They ask by default; listing `webfetch` in allow opens all of it (not recommended).
- A rule without `:` means whole-action (e.g. `webfetch`).

Precedence: **deny wins over allow, allow wins over ask.**

Outside-project operations always ask, no matter the command: the core asserts `external_directory` before every tool-specific check for targets outside the project, and this plugin never allowlists that action (only the denylist can hard-block it).

Shell redirections always ask too: any `>` in a shell command (`>`, `>>`, `2>`, `&>`, `>|`, …) can write a file, so it is asked for even when the command itself is allowlisted (`shell:echo *` passes `echo x`, but `echo x > file` asks). The check is deliberately coarse — a `>` inside quotes or `2>&1` also asks. Only the denylist can hard-block such a command.

### Approval replies and `always`

The gate re-evaluates every request, so a reply of `always` is stored by OpenCode but never bypasses the gate: unlisted operations keep asking (`always` behaves like `once`). To make an operation permanent, add it to the allowlist.

### Known limitations

- An absolute path *outside* the project inside a command run from *inside* it is not detected by the gate (OpenCode only reports the command text); it is covered only by the allowlist/denylist rules.

## Configuration

Plugin options or environment (`ALLOWLIST_GATE_ALLOW`, `ALLOWLIST_GATE_DENY` as comma/newline-separated lists; `ALLOWLIST_GATE_ENABLED`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/path/to/opencode-allowlist-plugin",
      "options": {
        "allow": ["shell:git pull *", "shell:git status *", "mcp:docs-mcp-server"],
        "deny": ["shell:rm -rf *", "shell:npm publish *"]
      }
    }
  ]
}
```

Default allow: `git status/diff/log`, `ls`, `cat`, `pwd`, `echo`, `mcp:docs-mcp-server`. Default deny: empty.

## Installation

```bash
npm install
npm test
```

### Global with local override (recommended)

No symlink: declare the plugin by absolute path, globally first, then per-project with the same `package` string. The last entry wins and **replaces** options wholesale — so local config must repeat the full lists.

`~/.config/opencode/opencode.json` (global):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/path/to/opencode-allowlist-plugin",
      "options": {
        "allow": ["shell:git pull *", "shell:git status *", "mcp:docs-mcp-server"],
        "deny": ["shell:rm -rf *", "shell:npm publish *"]
      }
    }
  ]
}
```

`<project>/.opencode/opencode.json` (override, only when needed): same shape, full lists.

Then restart the OpenCode server (`opencode service restart`) and check `opencode plugin list` for `allowlist-gate`.

> Do not combine a discovery symlink with an explicit entry for the same plugin: it would load twice under one `id` and the second load fails as a duplicate. Use either discovery or explicit entries.

### Global discovery only (no config file)

```bash
npm run plugin:install   # symlinks into ~/.config/opencode/plugins/allowlist-gate
```

Options then come only from the environment (`ALLOWLIST_GATE_ALLOW`, `ALLOWLIST_GATE_DENY`, `ALLOWLIST_GATE_ENABLED`). Remove with `npm run plugin:uninstall`.

## Tests

```bash
npm test
```

Suite on `node --test`, no external framework: pure matching (`policy.test.js`: shell params, compound commands, edit paths, monads, MCP per-server, deny-wins, `external_directory`), config resolution (`config.test.js`), the hook against the real `Plugin.define` shape (`plugin.test.js`), and real `Host.resolve`/`Host.load` entrypoint resolution (`resolution.test.js`).

## How it works

The plugin registers a single `permission.evaluate` hook — the same pipeline every built-in tool goes through via `Permission.assert` (see `source_app/opencode/packages/core/src/permission.ts`). Overriding `event.effect` there drives the native `permission.asked` TUI dialog, so enforcement is applicative: the model cannot talk its way past it.
