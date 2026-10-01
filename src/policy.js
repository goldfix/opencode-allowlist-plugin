/**
 * Pure allowlist/denylist policy for dispositive operations.
 *
 * Rule syntax is `scope:pattern`, where scope is one of:
 * - `shell`  → permission action "shell"; pattern tested against each resource
 *               (one resource per parsed command, e.g. "git push origin main").
 * - `edit`   → permission action "edit" (covers edit/write/patch); pattern
 *               tested against each resource (file path).
 * - `mcp`    → MCP tools per-server; pattern is a server name, wildcards
 *               allowed (`mcp:docs-mcp-server`, `mcp:docs-*`). Resources are
 *               ignored because core always asserts MCP tools with resources
 *               `["*"]` (source_app/opencode/packages/core/src/tool/mcp.ts),
 *               so matching is on the action-name prefix `<server>_`.
 * - `webfetch`, `websearch` → monads: whole-action only, no per-URL/query
 *               specialization (a rule carrying a pattern never matches).
 * - any other scope → exact action name, pattern tested against resources
 *               (generic fallback, e.g. `skill:*`).
 *
 * A rule without `:` (or with pattern `*`) covers the whole action.
 *
 * Decision order: deny wins over allow, allow wins over ask.
 * - deny:  ANY resource matching a deny rule blocks the operation.
 * - allow: EVERY resource must be covered by an allow rule. A compound shell
 *          command (`git status && git push`) reaches us as one resource per
 *          sub-command, so a single allowed part must not let the rest through.
 * - read-only actions (SAFE_PASSTHROUGH) are never touched.
 * - everything else is gated and asks.
 * Exception: `external_directory` — the core's outside-project boundary — is
 * never allowlistable and always asks (deny still wins). The same holds for
 * shell commands containing a redirection (`>`, `>>`): they can write files, so
 * they always ask whatever the allowlist says.
 */

/** Read-only actions the gate never touches. */
export const SAFE_PASSTHROUGH = new Set(["grep", "glob", "question", "read"])

/**
 * Outside-project boundary action asserted by the core before every
 * tool-specific assert (see source_app/opencode/packages/core/src/file-access.ts).
 */
export const EXTERNAL_ACTION = "external_directory"

/** Monadic actions: matched on action name only, resources ignored. */
export const MONADS = new Set(["webfetch", "websearch"])

/**
 * A shell redirection (`>`, `>>`, `2>`, `&>`, …) is part of the resource text of
 * the command it belongs to, so an allowlisted command could silently write
 * files. Any `>` in a shell resource therefore forces an ask. Deliberately
 * coarse: a quoted `>` also asks, which errs on the safe side.
 */
const SHELL_ACTION = "shell"
const REDIRECTION = ">"

/** Mirrors core's MCP namespace sanitization, but keeps `*`/`?` wildcards intact. */
export function namespaceServer(server) {
  return String(server ?? "").replace(/[^A-Za-z0-9_\-*?]/g, "_")
}

export function parseRule(raw) {
  const text = String(raw ?? "").trim()
  if (!text) return null
  const idx = text.indexOf(":")
  if (idx === -1) return { scope: text, pattern: "*" }
  const scope = text.slice(0, idx).trim()
  const pattern = text.slice(idx + 1).trim() || "*"
  if (!scope) return null
  return { scope, pattern }
}

// Same semantics as core Wildcard.match (without the win32 flag nuance):
// `*` → `.*`, `?` → `.`, plus the trailing " *" shorthand also matching the bare prefix.
export function wildcardMatch(input, pattern) {
  const normalized = String(input).replaceAll("\\", "/")
  let escaped = String(pattern)
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"
  return new RegExp("^" + escaped + "$", "s").test(normalized)
}

/** How a rule applies to an action: "whole" (whole action), "resource" (needs per-resource match) or null. */
function applicability(rule, action) {
  if (rule.scope === "mcp") return wildcardMatch(action, `${namespaceServer(rule.pattern)}_*`) ? "whole" : null
  if (rule.scope !== action) return null
  if (rule.pattern === "*") return "whole"
  return MONADS.has(action) ? null : "resource"
}

function applicable(rules, action) {
  return rules.flatMap((rule) => {
    const kind = applicability(rule, action)
    return kind ? [{ pattern: rule.pattern, kind }] : []
  })
}

export function evaluate(action, resources, lists) {
  const allow = applicable((lists?.allow ?? []).map(parseRule).filter(Boolean), action)
  const deny = applicable((lists?.deny ?? []).map(parseRule).filter(Boolean), action)
  const res = (resources ?? []).map(String)

  const denied = deny.some((rule) => rule.kind === "whole" || res.some((r) => wildcardMatch(r, rule.pattern)))
  if (denied) return { decision: "deny" }

  if (action === EXTERNAL_ACTION) return { decision: "ask" }
  if (action === SHELL_ACTION && res.some((r) => r.includes(REDIRECTION))) return { decision: "ask" }

  const allowed =
    allow.some((rule) => rule.kind === "whole") ||
    (res.length > 0 && res.every((r) => allow.some((rule) => wildcardMatch(r, rule.pattern))))
  if (allowed) return { decision: "allow" }

  if (SAFE_PASSTHROUGH.has(action)) return { decision: "passthrough" }
  return { decision: "ask" }
}
