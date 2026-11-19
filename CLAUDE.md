# CLAUDE.md
Project instructions for Claude Code. Spec lives in docs/. Never read or write secrets; data/ is local only.

## Agent skills

### Issue tracker

GitHub Issues on `michal-isep/armazem-calcado-dashboard`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context; the glossary is at `docs/GLOSSARY.md` and ADRs are in `docs/adr/`. See `docs/agents/domain.md`.
