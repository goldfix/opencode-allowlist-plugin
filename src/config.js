/**
 * Configuration resolution: plugin options + env, no file persistence.
 *
 * Options:
 * - enabled (bool, default true) / ALLOWLIST_GATE_ENABLED
 * - allow (string[] of `scope:pattern`) / ALLOWLIST_GATE_ALLOW (comma or newline separated)
 * - deny  (string[] of `scope:pattern`) / ALLOWLIST_GATE_DENY
 *
 * Defaults are intentionally minimal: a few read-only shell commands pass,
 * everything else gated asks. The docs MCP server passes; DB and other MCP
 * servers ask unless added to allow. An explicit `allow: []` disables the defaults.
 */

const DEFAULT_ALLOW = [
  "shell:git status *",
  "shell:git diff *",
  "shell:git log *",
  "shell:ls *",
  "shell:cat *",
  "shell:pwd *",
  "shell:echo *",
  "mcp:docs-mcp-server",
]

function toStringList(value) {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  return String(value)
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function toBool(value, fallback) {
  if (value === undefined) return fallback
  if (typeof value === "boolean") return value
  const text = String(value).trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(text)) return true
  if (["0", "false", "no", "off"].includes(text)) return false
  return fallback
}

export function resolveConfig(options, env = {}) {
  const opts = options ?? {}
  return {
    enabled: toBool(opts.enabled ?? env.ALLOWLIST_GATE_ENABLED, true),
    allow: toStringList(opts.allow ?? env.ALLOWLIST_GATE_ALLOW) ?? [...DEFAULT_ALLOW],
    deny: toStringList(opts.deny ?? env.ALLOWLIST_GATE_DENY) ?? [],
  }
}
