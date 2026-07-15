# @wandrydev/clickup

Typed ClickUp API client. The HTTP layer and types are generated from ClickUp's
OpenAPI specs via [`@hey-api/openapi-ts`](https://heyapi.dev); a thin hand-written
layer adds ergonomic helpers, structured logging hooks, and a few workarounds for
fields the spec omits.

Framework-agnostic: no runtime dependencies, runs anywhere `fetch` exists
(Node 18+, browsers, edge runtimes).

## Install

```sh
bun add @wandrydev/clickup   # or npm / pnpm / yarn
```

## Usage

```ts
import { createClickUp } from "@wandrydev/clickup"

const clickup = createClickUp({
  token: process.env.CLICKUP_PERSONAL_API_TOKEN!,
})

const task = await clickup.getTask("abc123")
const { tasks } = await clickup.getTeamTasks(teamId, { list_ids: [listId] })
await clickup.postCommentWithMention(task.id, {
  clickupUserId: 42,
  username: "alice",
  messageAfter: " please review",
})
```

### Logging

Pass a logger to capture per-call structured events; omit it for silence.

```ts
import { createClickUp, type ClickUpLogger } from "@wandrydev/clickup"

const logger: ClickUpLogger = {
  info: (data) => console.log("clickup", data),
  warn: (data) => console.warn("clickup", data),
}

const clickup = createClickUp({ token, logger })
```

## API

`createClickUp({ token, logger?, baseUrl? })` returns a client with:

| Method | Description |
| --- | --- |
| `getTask(taskId)` | Fetch a single task. |
| `getTeamTasks(teamId, params)` | Filtered team tasks (paginated). |
| `findTaskInTeam(teamId, task)` | Locate a task (with per-user estimates) across pages. |
| `getTimeEntries(teamId, params)` | Time entries within a date range. |
| `getTaskTimeEntriesPerAssignee(teamId, taskId, assigneeIds, range?)` | Per-assignee time entries; tolerates `TIMEENTRY_059`. |
| `getList(listId)` | Fetch a list (non-throwing). |
| `getSpaces(teamId)` | Spaces in a workspace, each with `members` (the user source for mirroring). |
| `getSpace(spaceId)` | A single space (no `members` — use `getSpaces` for users). |
| `getFolders(spaceId)` | Folders in a space, with nested `lists`. |
| `getFolderlessLists(spaceId)` | Lists that live directly under a space. |
| `getFolderLists(folderId)` | Lists inside a folder. |
| `getListTasks(listId, params)` | List tasks; the only endpoint exposing `archived` tasks. |
| `createTask(listId, params)` | Create a task in a list. |
| `createTaskAttachment(taskId, params)` | Upload a file onto a task. |
| `postComment(taskId, text)` | Plain comment. |
| `postCommentWithMention(taskId, params)` | Comment with an `@`-mention. |

`createTask` requires `name`; `description`, `markdown_content`, `status`,
`assignees` and `custom_item_id` are optional and are left out of the request
when omitted, so ClickUp applies its own defaults (no `status` means the list's
first status).

```ts
const task = await clickup.createTask("901100", {
  name: "Crash on checkout",
  markdown_content: "## Steps\n1. Open cart",
  status: "to do",
  assignees: [42],
  custom_item_id: 1300,
})

await clickup.createTaskAttachment(task.id, {
  file: new Blob([bytes], { type: "image/png" }),
  filename: "screenshot.png",
})
```

## Development

```sh
bun install
bun run clickup:types   # regenerate src/generated from openapi/clickup-*.json
bun run build           # emit dist/ (esm + cjs + d.ts)
bun run typecheck
bun run test
```

Codegen reads the raw specs in `openapi/`, preprocesses them
(`scripts/preprocess-clickup-openapi.ts`) into `openapi/.generated/`, then runs
`openapi-ts` (`openapi-ts.config.ts`) into `src/generated/{v2,v3}`. Hand-written
type extensions live in `src/generated/v2/custom_types.ts` and survive regeneration
(`output.clean: false`).
