# Surface Output Parsing (forge surfaces text mode)

> Bundled verbatim from the forge CC plugin's session-start guide
> (`plugins/forge/hooks/guide.md` §Surface Output Parsing) — the guide is
> hook-injected in Claude Code sessions but has no dsh injection surface, so
> each skill that depends on the unified parsing rule carries its own copy.
> See this feature's `docs/features/dsh-forge-m3/design/skills-migration-manifest.md`.

### Surface Output Parsing

`forge surfaces` (text mode) outputs one surface per line. Skills must use text mode (not `--json`) and apply the unified parsing rule:

```
Per line of forge surfaces output:
  if line contains '=':
    key = part before '='
    type = part after '='
    → named surface (key is set)
  else:
    key = (empty)
    type = line
    → scalar surface (no key)
```

| Config form | Text output | key | type |
|-------------|------------|-----|------|
| Scalar: `surfaces: tui` | `tui` | empty | `tui` |
| Named: `surfaces: [{key: app, type: tui}]` | `app=tui` | `app` | `tui` |
| Multi: two named surfaces | `backend=api` then `frontend=web` | per-line | per-line |
