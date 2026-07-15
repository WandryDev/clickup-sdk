---
"@wandrydev/clickup": minor
---

Add `createTask` and `createTaskAttachment` to the public client.

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
