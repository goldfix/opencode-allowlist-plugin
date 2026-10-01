/**
 * OpenCode v2 plugin: applicative allowlist gate for dispositive operations.
 *
 * Single hook: `permission.hook("evaluate", ...)` — the native permission
 * pipeline (see source_app/opencode/packages/core/src/permission.ts). Setting
 * `event.effect` here drives the native TUI dialog (`permission.asked`),
 * never a model decision:
 * - allowlist match → `allow` (passes silently)
 * - denylist match → `deny`  (blocked, model gets a warning via BlockedError)
 * - otherwise (gated actions) → `ask` (blocks until once/always/reject)
 * - safe read-only tools (grep/glob/question/read) → untouched
 *
 * Monads: `webfetch`/`websearch` match on action only, no per-URL/query
 * patterns. MCP matches per-server (`mcp:<server>`), resources ignored.
 * `shell`/`edit` match `scope:pattern` against permission resources, so
 * `git pull` can pass while `git push` asks.
 */
import { Plugin } from "@opencode/plugin"
import { resolveConfig } from "./config.js"
import { evaluate } from "./policy.js"

export default Plugin.define({
  id: "allowlist-gate",
  async setup(ctx) {
    const config = resolveConfig(ctx.options, process.env)
    if (!config.enabled) return

    await ctx.permission.hook("evaluate", (event) => {
      const result = evaluate(event.action, [...(event.resources ?? [])], config)
      if (result.decision === "allow") {
        event.effect = "allow"
        event.message = undefined
        return
      }
      if (result.decision === "deny") {
        event.effect = "deny"
        event.message = `Blocked by allowlist-gate denylist: ${event.action} ${[...(event.resources ?? [])].join(" ")}`.trim()
        return
      }
      if (result.decision === "ask") {
        event.effect = "ask"
        event.message = `Requires approval (allowlist-gate): ${event.action} ${[...(event.resources ?? [])].join(" ")}`.trim()
      }
      // "passthrough": leave effect/message untouched.
    })
  },
})
