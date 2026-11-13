# Development Rules

## Model orchestration

These rules govern how work is divided across models.

- **Planning and complex analysis** → use a large model (`DeepSeek V4 Pro`) for
  architecture, design, planning, and orchestrating work.
- **Coding implementation** → fan out concrete coding tasks to lighter models
  (`DeepSeek Flash`).

## Model references

| Role                    | Model ID                            |
| ----------------------- | ----------------------------------- |
| Orchestrator / analysis | `opencode-go/deepseek-v4-pro`       |
| Coding fan-out          | `opencode-go/deepseek-v4.1-flash`   |

## Working pattern

1. Do the thinking first: clarify requirements, design the approach, and break
   the work into concrete, self-contained coding tasks before fanning out.
2. Dispatch independent coding tasks in parallel to Flash via subagents.
3. Give each Flash subagent full context (fresh child sessions start empty):
   include file paths, relevant code, and exact instructions.
4. Review and integrate Flash output before finishing.
5. Leave the tree clean and report git state before calling the work done
   (see Git & prototype pipeline).

## Git & prototype pipeline

`main` is the stable baseline. Prototypes never land on it by accident.

- **Layout.** One checkout. Prototype work happens on a `prototype/*` branch;
  `main` is the untouched baseline (`stable-pre-ui` tag marks the pre-UI
  commit) and is only reached by an explicitly approved merge.
- **Branches.** One branch per experiment, cut from `main`
  (`prototype/<area>-vN`). Don't chain experiments unless the new one
  explicitly builds on the previous branch.
- **Clean-tree gate.** `git status --porcelain` must be empty before creating,
  switching, or merging branches. Commit or stash first; never `git add -A`
  with untracked docs/design/scratch files present.
- **Line endings.** `.gitattributes` enforces LF. A whole-file diff means EOL
  churn: check `git diff --ignore-cr-at-eol` and never commit that.
- **Destructive actions.** `git restore`, `git checkout --`, deleting
  untracked files, removing worktrees, or discarding uncommitted work require
  explicit confirmation. When unsure, stash with a message.
- **Fan-out safety.** Parallel subagent tasks must not share files; sequence
  any overlap. Subagents do not run builds or commits — the orchestrator
  integrates and verifies.
- **Commit scope.** One concern per commit; code, docs, and design artifacts
  live on separate branches/commits. No merge to `main` without explicit
  approval.
- **Proof before done.** Build the touched side and report `git status`,
  `git log --oneline main..HEAD`, `git diff --stat main..HEAD`, and
  `git rev-parse --short main` (must equal the baseline unless a merge was
  approved).

## UI references

Static HTML mockups (reference only, not app code) live in the `design/` folder
at the repository root — no separate checkout:

- `design/` — README plus the six `*-bento-ui.html` mockups and `refs/`
- Catalogue, palette per mockup, and usage notes: `design/README.md`

`design/` is local-only: git ignores it via `.git/info/exclude` so it stays
visible on every branch. The versioned copy is branch `design/ui-references`.

Before changing UI, pick one mockup and name it in the task description; port
its tokens rather than copying its CSS.
