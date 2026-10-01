import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { evaluate, parseRule, wildcardMatch } from "../src/policy.js"

const none = { allow: [], deny: [] }

describe("wildcardMatch", () => {
  it("matches trailing star shorthand", () => {
    assert.equal(wildcardMatch("git pull origin main", "git pull *"), true)
    assert.equal(wildcardMatch("git pull", "git pull *"), true)
    assert.equal(wildcardMatch("git push origin", "git pull *"), false)
  })
  it("escapes regex metacharacters and supports ?", () => {
    assert.equal(wildcardMatch("a.b", "a.b"), true)
    assert.equal(wildcardMatch("axb", "a.b"), false)
    assert.equal(wildcardMatch("ab", "a?"), true)
  })
})

describe("parseRule", () => {
  it("splits scope and pattern, defaults to whole action", () => {
    assert.deepEqual(parseRule("shell:git pull *"), { scope: "shell", pattern: "git pull *" })
    assert.deepEqual(parseRule("webfetch"), { scope: "webfetch", pattern: "*" })
    assert.deepEqual(parseRule("edit:"), { scope: "edit", pattern: "*" })
  })
  it("keeps colons inside the pattern and ignores blanks", () => {
    assert.deepEqual(parseRule("shell:docker run -p 80:80 *"), { scope: "shell", pattern: "docker run -p 80:80 *" })
    assert.equal(parseRule("  "), null)
    assert.equal(parseRule(":x"), null)
  })
})

describe("evaluate: shell with params", () => {
  const lists = { allow: ["shell:git pull *"], deny: [] }
  it("git pull passes", () => {
    assert.equal(evaluate("shell", ["git pull origin main"], lists).decision, "allow")
  })
  it("git push asks", () => {
    assert.equal(evaluate("shell", ["git push origin main"], lists).decision, "ask")
  })
  it("empty resources never auto-allow", () => {
    assert.equal(evaluate("shell", [], lists).decision, "ask")
  })
})

describe("evaluate: compound commands (one resource per sub-command)", () => {
  const lists = { allow: ["shell:git status *", "shell:ls *"], deny: ["shell:rm -rf *"] }
  it("allows only when EVERY sub-command is allowlisted", () => {
    assert.equal(evaluate("shell", ["git status", "ls -la"], lists).decision, "allow")
  })
  it("one allowed part must not let a non-allowed part through", () => {
    assert.equal(evaluate("shell", ["git status", "git push origin main"], lists).decision, "ask")
  })
  it("ANY denied sub-command blocks the whole command", () => {
    assert.equal(evaluate("shell", ["ls", "rm -rf /tmp/x"], lists).decision, "deny")
  })
})

describe("evaluate: shell redirections always ask", () => {
  const lists = { allow: ["shell:echo *", "shell:cat *", "shell:npm *"], deny: ["shell:rm -rf *"] }
  it("asks for every redirection form even on allowlisted commands", () => {
    for (const command of ["echo x > file", "echo x >> file", "cat a 2> err.log", "npm test &> out.log", "echo x >| file"]) {
      assert.equal(evaluate("shell", [command], lists).decision, "ask", command)
    }
  })
  it("asks when only one sub-command of a compound command redirects", () => {
    assert.equal(evaluate("shell", ["echo hi", "cat a > b"], lists).decision, "ask")
  })
  it("still allows the same commands without redirection", () => {
    assert.equal(evaluate("shell", ["echo x"], lists).decision, "allow")
  })
  it("cannot be allowlisted away, but the denylist still wins", () => {
    assert.equal(evaluate("shell", ["echo x > file"], { allow: ["shell:*"], deny: [] }).decision, "ask")
    assert.equal(evaluate("shell", ["rm -rf /x > log"], lists).decision, "deny")
  })
  it("does not affect other actions", () => {
    assert.equal(evaluate("webfetch", ["https://x/?a>b"], { allow: ["webfetch"], deny: [] }).decision, "allow")
  })
})

describe("evaluate: edit patterns", () => {
  const lists = { allow: ["edit:docs/*"], deny: ["edit:docs/secret/*"] }
  it("allows matching paths, asks otherwise", () => {
    assert.equal(evaluate("edit", ["docs/readme.md"], lists).decision, "allow")
    assert.equal(evaluate("edit", ["src/index.js"], lists).decision, "ask")
  })
  it("deny wins inside an allowed folder", () => {
    assert.equal(evaluate("edit", ["docs/secret/key.txt"], lists).decision, "deny")
  })
  it("bare `edit` allows every file edit", () => {
    assert.equal(evaluate("edit", ["anything"], { allow: ["edit"], deny: [] }).decision, "allow")
  })
})

describe("evaluate: denylist wins", () => {
  const lists = { allow: ["shell:npm *"], deny: ["shell:npm publish *"] }
  it("npm publish denied even if broadly allowed", () => {
    assert.equal(evaluate("shell", ["npm publish --access public"], lists).decision, "deny")
  })
  it("npm test allowed", () => {
    assert.equal(evaluate("shell", ["npm test"], lists).decision, "allow")
  })
})

describe("evaluate: webfetch/websearch monads", () => {
  it("always ask by default", () => {
    assert.equal(evaluate("webfetch", ["https://example.com/docs"], none).decision, "ask")
    assert.equal(evaluate("websearch", ["opencode plugin"], none).decision, "ask")
  })
  it("whole-action allow passes any resource", () => {
    assert.equal(evaluate("webfetch", ["https://anything.example/x"], { allow: ["webfetch"], deny: [] }).decision, "allow")
  })
  it("per-url pattern does not specialize monad", () => {
    assert.equal(
      evaluate("webfetch", ["https://docs.example/x"], { allow: ["webfetch:https://docs.*"], deny: [] }).decision,
      "ask",
    )
  })
  it("whole-action deny blocks", () => {
    assert.equal(evaluate("websearch", ["q"], { allow: [], deny: ["websearch"] }).decision, "deny")
  })
})

describe("evaluate: mcp per-server", () => {
  it("docs server allowed, db server asks", () => {
    const lists = { allow: ["mcp:docs-mcp-server"], deny: [] }
    assert.equal(evaluate("docs-mcp-server_fetch_url", ["*"], lists).decision, "allow")
    assert.equal(evaluate("postgres-mcp_query", ["*"], lists).decision, "ask")
  })
  it("denied server blocks", () => {
    const lists = { allow: [], deny: ["mcp:postgres-mcp"] }
    assert.equal(evaluate("postgres-mcp_query", ["*"], lists).decision, "deny")
  })
  it("matches whole server names only, not loose prefixes", () => {
    const lists = { allow: ["mcp:docs"], deny: [] }
    assert.equal(evaluate("docs_fetch", ["*"], lists).decision, "allow")
    assert.equal(evaluate("docs-mcp-server_fetch_url", ["*"], lists).decision, "ask")
  })
  it("supports wildcard server patterns", () => {
    const lists = { allow: ["mcp:docs-*"], deny: [] }
    assert.equal(evaluate("docs-mcp-server_fetch_url", ["*"], lists).decision, "allow")
    assert.equal(evaluate("postgres-mcp_query", ["*"], lists).decision, "ask")
  })
  it("sanitizes server names like core does", () => {
    const lists = { allow: ["mcp:my.server"], deny: [] }
    assert.equal(evaluate("my_server_ping", ["*"], lists).decision, "allow")
  })
})

describe("evaluate: safe passthrough and unmapped ask", () => {
  it("read-only actions untouched", () => {
    for (const action of ["grep", "glob", "read", "question"]) {
      assert.equal(evaluate(action, ["x"], none).decision, "passthrough")
    }
  })
  it("unmapped edit, skill and unknown actions ask", () => {
    assert.equal(evaluate("edit", ["/tmp/a.txt"], none).decision, "ask")
    assert.equal(evaluate("skill", ["x"], none).decision, "ask")
    assert.equal(evaluate("something_new", ["x"], none).decision, "ask")
  })
})

describe("evaluate: external_directory never allowlistable", () => {
  it("asks even when explicitly allowlisted", () => {
    const lists = { allow: ["external_directory", "external_directory:/tmp/*"], deny: [] }
    assert.equal(evaluate("external_directory", ["/tmp/x/*"], lists).decision, "ask")
  })
  it("asks with empty lists", () => {
    assert.equal(evaluate("external_directory", ["/etc/*"], none).decision, "ask")
  })
  it("denylist still wins", () => {
    const lists = { allow: [], deny: ["external_directory:/etc/*"] }
    assert.equal(evaluate("external_directory", ["/etc/*"], lists).decision, "deny")
  })
})
