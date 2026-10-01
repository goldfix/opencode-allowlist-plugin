import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { resolveConfig } from "../src/config.js"

describe("resolveConfig", () => {
  it("defaults to enabled with the built-in allowlist and no denylist", () => {
    const config = resolveConfig({}, {})
    assert.equal(config.enabled, true)
    assert.ok(config.allow.includes("shell:git status *"))
    assert.ok(config.allow.includes("mcp:docs-mcp-server"))
    assert.deepEqual(config.deny, [])
  })
  it("env lists split on comma/newline", () => {
    const config = resolveConfig({}, { ALLOWLIST_GATE_ALLOW: "shell:ls *,shell:pwd *\nedit:docs/*", ALLOWLIST_GATE_DENY: "shell:rm -rf *" })
    assert.deepEqual(config.allow, ["shell:ls *", "shell:pwd *", "edit:docs/*"])
    assert.deepEqual(config.deny, ["shell:rm -rf *"])
  })
  it("options win over env", () => {
    const config = resolveConfig({ allow: ["webfetch"], deny: [] }, { ALLOWLIST_GATE_ALLOW: "shell:ls *" })
    assert.deepEqual(config.allow, ["webfetch"])
  })
  it("an explicit empty allow list disables the defaults", () => {
    assert.deepEqual(resolveConfig({ allow: [] }, {}).allow, [])
  })
  it("parses the enabled flag from options and env", () => {
    assert.equal(resolveConfig({ enabled: false }, {}).enabled, false)
    assert.equal(resolveConfig({}, { ALLOWLIST_GATE_ENABLED: "off" }).enabled, false)
    assert.equal(resolveConfig({}, { ALLOWLIST_GATE_ENABLED: "garbage" }).enabled, true)
  })
})
