---
"@wandrydev/clickup": minor
---

Add `@wandrydev/clickup/testing`: a Node-only fake ClickUp HTTP server (in-process or as a standalone process) (`createClickUpFake`) plus fixture factories (`fakeSpace`, `fakeFolder`, `fakeList`, `fakeTask`, `fakeTimeEntry`). It serves the routes behind `getTask`, `getTeamTasks`, `getTimeEntries`, `getList`, `getSpace`, `getFolders`, `getFolderlessLists`, `getListTasks` and `setTaskType`, records calls, and can inject one-shot failures, so consumers can point `baseUrl` at it in integration and e2e tests.
