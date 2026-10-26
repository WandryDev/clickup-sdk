# @wandrydev/clickup

## 0.6.0

### Minor Changes

- 366dd0f: Add read methods for showing a task outside ClickUp.

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

## 0.5.0

### Minor Changes

- 9590305: Add `setTaskType` to the public client.

  `setTaskType(taskId, customItemId)` changes a task's custom task type and
  nothing else: the request body is exactly `{ custom_item_id }`, so ClickUp's
  patch semantics leave every other attribute of the task untouched. The narrow
  signature is the point — a general `updateTask(taskId, body)` would move that
  guarantee into each call site, where an extra field can slip in and silently
  overwrite what someone edited in ClickUp.

  Failures throw an `Error` whose message carries ClickUp's HTTP status and body,
  and which now also carries the status as an `error.status` number. Callers that
  back off on `429` can branch on the field instead of matching a code out of the
  message.

## 0.4.0

### Minor Changes

- c16e905: Add `createTask` and `createTaskAttachment` to the public client.

  `createTask(listId, params)` files a task into a list. `name` is required;
  `description`, `markdown_content`, `status`, `assignees` and `custom_item_id`
  are optional and omitted from the request body when not supplied, so ClickUp
  applies its own defaults (notably: no `status` means the list's first status).

  `createTaskAttachment(taskId, { file, filename })` uploads a file onto an
  existing task as `multipart/form-data`.

  Both send the auth token and emit structured log events like the existing
  methods, and raise an `Error` carrying ClickUp's HTTP status code alongside the
  response body, so an outage stays distinguishable from a rejected request.
  `ClickUpAttachment`, `CreateTaskParams` and `CreateTaskAttachmentParams` are
  exported from the package root.

  Also removes the `include` regex from the v2 codegen config: `input.include` is
  not supported by `@hey-api/openapi-ts` 0.96.x and was silently ignored, so it
  described a filter that never applied.

## 0.3.0

### Minor Changes

- Add tree-walk and archived-task helpers for mirror sync

  New public helpers on the client for walking the ClickUp tree
  (spaces → folders → lists → tasks → time entries) during incremental sync:

  - `getSpaces(teamId)` — spaces in a workspace, each with `members` (the user source for mirroring)
  - `getSpace(spaceId)` — a single space (note: this endpoint returns no `members`; use `getSpaces` for users)
  - `getFolders(spaceId)` — folders in a space, with their nested `lists`
  - `getFolderlessLists(spaceId)` — lists that live directly under a space
  - `getFolderLists(folderId)` — lists inside a folder
  - `getListTasks(listId, params)` — list-level tasks; the only endpoint exposing `archived` tasks (supports `archived`, `include_closed`, `subtasks`, `page`)

  Also:

  - `getTimeEntries` now accepts a `space_id` filter
  - New exported types: `ClickUpFolder`, `ClickUpList`, `GetListTasksParams`; `ClickUpSpace` now carries `members`

  All tree helpers throw on failure (sync-critical); `getList` keeps its non-throwing behaviour.

## 0.2.0

### Minor Changes

- c391a7a: Initial public release: typed, framework-agnostic ClickUp API client generated from ClickUp's OpenAPI specs, with ergonomic helpers and an injectable logger.

### Patch Changes

- 519c18f: init
