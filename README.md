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
| `getWorkspaces()` | Workspaces the token can reach; each `id` is the `teamId` other methods take. |
| `getTask(taskId, options?)` | Fetch a single task. `{ include_markdown_description: true }` adds `markdown_description`. |
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
| `getTaskComments(taskId, params?)` | Comments on a task, 25 per page, newest first. |
| `getThreadedComments(commentId)` | Replies threaded under a comment. |
| `getTaskTimeInStatus(taskId)` | Time spent in each status (needs the "Total time in Status" ClickApp). |
| `getRunningTimeEntry(teamId, params?)` | The running timer, or `null` when none runs. |
| `createTask(listId, params)` | Create a task in a list. |
| `createTaskAttachment(taskId, params)` | Upload a file onto a task. |
| `setTaskType(taskId, customItemId)` | Change a task's custom task type; sends `custom_item_id` and nothing else. |
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

`getTaskComments` pages backwards: pass the oldest comment you already have as
the cursor to get the 25 before it. Replies are not inlined; a comment with a
non-zero `reply_count` has its thread behind `getThreadedComments`. ClickUp
sends `reply_count` as a string, so compare `Number(comment.reply_count) > 0`
rather than testing it for truthiness (`"0"` is truthy).

```ts
const [workspace] = await clickup.getWorkspaces()
if (!workspace) throw new Error("The token reaches no workspace")
const task = await clickup.getTask(taskId, { include_markdown_description: true })

const page = await clickup.getTaskComments(taskId)
const oldest = page.at(-1)
const older = oldest
  ? await clickup.getTaskComments(taskId, {
      start: Number(oldest.date),
      start_id: oldest.id,
    })
  : []

const timer = await clickup.getRunningTimeEntry(workspace.id)
```

`setTaskType` sends a body of exactly `custom_item_id`, so ClickUp's patch
semantics leave every other field of the task alone. Failures throw an `Error`
carrying ClickUp's status both in the message and as `error.status`, so a `429`
stays machine-readable for a caller that backs off.

```ts
await clickup.setTaskType(task.id, 1002)
```

## Testing

`@wandrydev/clickup/testing` ships a fake ClickUp HTTP server for integration and
e2e tests. It is **Node-only** (it uses `node:http`) and is a separate entry
point, so it never ends up in the main bundle.

It serves the routes behind `getTask`, `getTeamTasks`, `getTimeEntries`,
`getList`, `getSpace`, `getFolders`, `getFolderlessLists`, `getListTasks` and
`setTaskType`. Anything else answers 404 and is recorded as `unknown`.

```ts
import { createClickUp } from "@wandrydev/clickup"
import {
  createClickUpFake,
  fakeFolder,
  fakeList,
  fakeSpace,
  fakeTask,
} from "@wandrydev/clickup/testing"

const fake = await createClickUpFake({
  spaces: [fakeSpace({ id: "101", name: "Dev" })],
  folders: [fakeFolder({ id: "201", space: { id: "101" } })],
  lists: [
    fakeList({
      id: "301",
      folder: { id: "201", hidden: false },
      space: { id: "101" },
    }),
  ],
  tasks: [fakeTask({ id: "abc", list: { id: "301" }, folder: { id: "201" } })],
})

const clickup = createClickUp({ token: "test", baseUrl: fake.url })

await clickup.setTaskType("abc", 1002)
fake.calls("setTaskType") // [{ method, path, query, body: { custom_item_id: 1002 } }]

fake.failOnce("getTask", { status: 429 }) // next getTask fails once
await fake.reset({ tasks: [] }) // new fixtures, clears calls and failures
await fake.close()
```

Notes:

- The SDK turns space, folder, list and team ids into numbers, so use numeric
  strings (`"101"`) for those ids in fixtures. Task ids can be anything.
- A list without a `folder` override is folderless (`getFolderlessLists`).
- `failOnce(helper, { status, taskId?, body? })` fails the next matching request
  once; `taskId` restricts it to requests for that task.
- Team tasks and list tasks paginate 100 per page, like ClickUp.

To run it as a separate process (e.g. for browser e2e), start it from a script and
point the app's ClickUp base URL at the printed address:

```ts
// fake-clickup.mjs
import { createClickUpFake } from "@wandrydev/clickup/testing"

const fake = await createClickUpFake({ /* fixtures */ })
console.log(fake.url) // http://127.0.0.1:<port>/api
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
