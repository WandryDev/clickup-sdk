# @wandrydev/clickup

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
