---
"@wandrydev/clickup": minor
---

Add `setTaskType` to the public client.

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
