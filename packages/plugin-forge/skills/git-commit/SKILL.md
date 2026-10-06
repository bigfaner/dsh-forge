---
name: git-commit
description: Create a git commit following Conventional Commits discipline — atomic grouping, explicit-file staging (never git add -A), lowercase imperative subject under 72 chars. Enforcement is skill-text-only (C9 degradation, dsh 0.2.0-rc.2 has no tool-use hook face).
---

# Git Commit

## Atomic Commits

Group highly related changes; split unrelated ones: a feature with its tests and its
docs in one commit; unrelated features, fixes, and independent refactors apart.

## Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Adding or modifying tests |
| `refactor` | Code refactoring |
| `chore` | Maintenance, tooling, deps |

Scopes follow the package or layer touched — `core`, `web`, `host`, `contracts`,
`plugin-forge`, `knowledge`, `docs`, `test`, `cli`.

Subject rules: lowercase first letter, no trailing period, imperative mood, max 72
characters.

## Steps

1. Run `git status` and `git diff` to inspect the changes.
2. Stage with **explicit file paths only**.
3. Compose the message per the rules above.
4. Commit; record the hash and pass it as `commit_hash` to `submitTask`.

<HARD-RULE>
**NEVER use broad staging commands: `git add -A`, `git add .`, `git add --all`.**

Every `git add` must list explicit file paths. If you do not know which files changed,
run `git diff --name-only` and `git diff --cached --name-only` first and stage from that
list. Broad staging sweeps unrelated untracked files and generated residue into the
commit — a prior incident turned a 2-file fix into a 169-file commit this way. Commit
only files related to the current task; never commit unrelated pre-existing changes.
</HARD-RULE>

## Task Completion Template

```bash
git add <explicit-file-paths>
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

Task: <slug>/<localId>

Co-Authored-By: Agent
EOF
)"
```

`<slug>/<localId>` is the natural key of the task being settled — the same key used with
`submitTask`.

## Enforcement Note (C9 degradation)

This discipline is **carried by this skill text only**: dsh `0.2.0-rc.2` exposes no
per-tool-use hook face, so nothing mechanically blocks a malformed message or broad
staging — the model's adherence to this text is the sole enforcement. Re-evaluate
mechanical enforcement at the next upgrade window.

Git itself is an optional environment dependency: when `git` is unavailable (command not
found, not a repository), do not fake a commit or a hash — settle via the submit-task
blocked path instead.
