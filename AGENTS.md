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
