import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { Plugin } from "@opencode/plugin"
import gate from "../src/index.js"

function makeCtx(options) {
  const handlers = {}
  return {
    options,
    handlers,
    permission: {
      hook: async (name, cb) => {
        handlers[name] = cb
        return { dispose: async () => {} }
      },
    },
  }
}

describe("plugin: permission.evaluate gate", () => {
  it("registers and forces allow/ask/deny applicatively", async () => {
    assert.equal(gate.id, "allowlist-gate")
    assert.equal(typeof gate.setup, "function")
    // Real library shape check (not a hand mock of Plugin itself).
    assert.equal(typeof Plugin.define, "function")

    const ctx = makeCtx({ allow: ["shell:git pull *", "mcp:docs-mcp-server"], deny: ["shell:npm publish *"] })
    await gate.setup(ctx)
    const evaluate = ctx.handlers.evaluate
    assert.equal(typeof evaluate, "function")

    const gitPull = { action: "shell", resources: ["git pull origin main"], effect: "ask" }
    evaluate(gitPull)
    assert.equal(gitPull.effect, "allow")

    const gitPush = { action: "shell", resources: ["git push origin main"], effect: "allow" }
    evaluate(gitPush)
    assert.equal(gitPush.effect, "ask")
    assert.match(gitPush.message, /Requires approval/)

    const publish = { action: "shell", resources: ["npm publish --access public"], effect: "ask" }
    evaluate(publish)
    assert.equal(publish.effect, "deny")
    assert.match(publish.message, /denylist/)

    const docs = { action: "docs-mcp-server_fetch_url", resources: ["*"], effect: "ask" }
    evaluate(docs)
    assert.equal(docs.effect, "allow")

    const web = { action: "webfetch", resources: ["https://example.com"], effect: "allow" }
    evaluate(web)
    assert.equal(web.effect, "ask")

    const grep = { action: "grep", resources: ["foo"], effect: "allow" }
    evaluate(grep)
    assert.equal(grep.effect, "allow")

    const external = { action: "external_directory", resources: ["/tmp/x/*"], effect: "allow" }
    evaluate(external)
    assert.equal(external.effect, "ask")

    const compound = { action: "shell", resources: ["git pull origin main", "git push origin main"], effect: "allow" }
    evaluate(compound)
    assert.equal(compound.effect, "ask")

    const redirect = { action: "shell", resources: ["git status > out.txt"], effect: "allow" }
    evaluate(redirect)
    assert.equal(redirect.effect, "ask")
  })
  it("disabled plugin registers nothing", async () => {
    const ctx = makeCtx({ enabled: false })
    await gate.setup(ctx)
    assert.equal(ctx.handlers.evaluate, undefined)
  })
})
