# CLAUDE.md
Project instructions for Claude Code. Spec lives in docs/. Never read or write secrets; data/ is local only.

## Working rules

1. **No Claude attribution.** No `Co-Authored-By` line in commits and no "Generated with Claude Code" line in pull requests.
2. **Every issue gets its own branch.** Before working on an issue, create a branch for it from an up-to-date `main`, named `issue-<n>-<short-name>`. One issue per branch; no work on `main`.
   When the work is done: push the branch, open a pull request whose body says `Closes #n`, and Michal merges it, which closes the issue. After the merge, switch to `main`, pull, and delete the branch. Never merge or push to `main` yourself.
3. **Start of every session:** read `docs/sprint1-summary.md`, run `gh issue list`, and read the `sprint1` board (`gh project item-list 3 --owner michal-isep`) to see what is next.
4. **Before coding:** read `docs/index.md`, `docs/spec.md` and the ADRs in `docs/adr/`. If the code would contradict one, say so before writing it.
5. **Before the session is cleared:** update `docs/sprint1-summary.md` with what was done, what was decided and what is next.

## Agent skills

### Issue tracker

GitHub Issues on `michal-isep/armazem-calcado-dashboard`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context; the glossary is at `docs/GLOSSARY.md` and ADRs are in `docs/adr/`. See `docs/agents/domain.md`.
