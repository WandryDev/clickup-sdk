---
"@wandrydev/clickup": minor
---

Add read methods for showing a task outside ClickUp.

- `getWorkspaces()` lists the workspaces the token can reach (`GET /team`).
  Each `id` is the `teamId` the team-scoped methods take, so a caller no longer
  needs to know it in advance.
- `getTask(taskId, { include_markdown_description: true })` also returns the
  description as Markdown in `markdown_description`. Without the option the
  request is unchanged.
- `getTaskComments(taskId, { start?, start_id? })` reads a page of comments,
  and `getThreadedComments(commentId)` reads the replies under one.
- `getTaskTimeInStatus(taskId)` returns how long the task has spent in each
  status. ClickUp only answers when the "Total time in Status" ClickApp is on.
- `getRunningTimeEntry(teamId, { assignee? })` returns the running timer, or
  `null` when none runs.

All five throw on failure, like `getTask` (`getList` stays best-effort). `ClickUpWorkspace`,
`ClickUpTaskComment`, `ClickUpTimeInStatus`, `ClickUpRunningTimeEntry`,
`GetTaskOptions`, `GetTaskCommentsParams` and `GetRunningTimeEntryParams` are
exported from the package root.
