import type {
  CreateTaskAttachmentData,
  CreateTaskData,
  GetFilteredTeamTasksData,
  GetTasksData,
  GetTimeEntriesWithinDateRangeData,
} from "./generated/v2"
import {
  createTaskComment,
  getFilteredTeamTasks,
  getTimeEntriesWithinDateRange,
  createTask as sdkCreateTask,
  createTaskAttachment as sdkCreateTaskAttachment,
  getFolderlessLists as sdkGetFolderlessLists,
  getFolders as sdkGetFolders,
  getList as sdkGetList,
  getLists as sdkGetLists,
  getSpace as sdkGetSpace,
  getSpaces as sdkGetSpaces,
  getTask as sdkGetTask,
  getTasks as sdkGetTasks,
} from "./generated/v2"
import type { Client } from "./generated/v2/client"
import type {
  ClickUpAttachment,
  ClickUpComment,
  ClickUpFolder,
  ClickUpList,
  ClickUpSpace,
  ClickUpTask,
  ClickUpTimeEntry,
} from "./generated/v2/custom_types"
import type { ClickUpLogger } from "./logger"

// Everything a bound method needs: the per-instance HTTP client (carries the
// auth token + logging interceptor) and the injected logger.
export interface ClickUpContext {
  v2: Client
  logger: ClickUpLogger
}

export interface GetTeamTasksParams {
  list_ids?: string[]
  assignees?: number[]
  statuses?: string[]
  date_updated_gt?: number
  include_closed?: boolean
  subtasks?: boolean
  page?: number
}

export interface GetTimeEntriesParams {
  task_id?: string
  assignee?: string
  space_id?: string
  start_date?: number
  end_date?: number
}

export interface GetListTasksParams {
  archived?: boolean
  include_closed?: boolean
  subtasks?: boolean
  page?: number
}

export interface CreateTaskParams {
  name: string
  description?: string
  /**
   * Markdown description. ClickUp names this `markdown_content` on create and
   * prefers it over `description` when both are sent.
   */
  markdown_content?: string
  /** Status name. Omit to let ClickUp apply the list's first status. */
  status?: string
  assignees?: number[]
  /** Custom task type id. Omit for a standard "Task". */
  custom_item_id?: number
}

export interface CreateTaskAttachmentParams {
  /** File content. */
  file: Blob
  /** Name the attachment gets in ClickUp. */
  filename: string
}

export type MentionPart =
  | { text: string }
  | {
      text: string
      type: "tag_user"
      attributes: { user_id: number }
    }

const FIND_TASK_MAX_PAGES = 10
const FIND_TASK_WINDOW_MS = 5_000

// `throwOnError: true` throws the parsed response body alone, so the HTTP
// status never reaches the caller — and an empty error body (a 502 from a
// proxy) arrives as `{}`. The create methods use the non-throwing form and
// build the message here instead, so an outage stays distinguishable from a
// bad list id or an unknown status name.
function describeFailure(
  response: Response | undefined,
  error: unknown,
): string {
  if (!response) {
    const cause = error instanceof Error ? error.message : String(error)
    return `no response: ${cause}`
  }
  const body =
    error instanceof Error ? error.message : (JSON.stringify(error) ?? "")
  // An empty error body reaches us as the literal "{}" (the generated client
  // coerces it), which tells the caller nothing — report the status alone.
  return !body || body === "{}"
    ? `${response.status}`
    : `${response.status}: ${body}`
}

export function createHelpers(ctx: ClickUpContext) {
  const { v2: client, logger } = ctx

  async function getTask(taskId: string): Promise<ClickUpTask> {
    try {
      const { data } = await sdkGetTask({
        client,
        path: { task_id: taskId },
        throwOnError: true,
      })
      const task = data as ClickUpTask
      logger.info({ call: "getTask", taskId, response: structuredClone(task) })
      return task
    } catch (error) {
      throw new Error(
        `ClickUp GET /task/${taskId} failed: ${JSON.stringify(error)}`,
      )
    }
  }

  async function getTeamTasks(
    teamId: string,
    params: GetTeamTasksParams,
  ): Promise<{ tasks: ClickUpTask[] }> {
    const query: NonNullable<GetFilteredTeamTasksData["query"]> = {}
    if (params.list_ids) query["list_ids[]"] = params.list_ids
    if (params.assignees)
      query["assignees[]"] = params.assignees.map((a) => String(a))
    if (params.statuses) query["statuses[]"] = params.statuses
    if (params.date_updated_gt !== undefined)
      query.date_updated_gt = params.date_updated_gt
    if (params.include_closed !== undefined)
      query.include_closed = params.include_closed
    if (params.subtasks !== undefined) query.subtasks = params.subtasks
    if (params.page !== undefined) query.page = params.page

    try {
      const { data } = await getFilteredTeamTasks({
        client,
        path: { team_Id: Number(teamId) },
        query,
        throwOnError: true,
      })
      logger.info({
        call: "getTeamTasks",
        teamId,
        page: params.page ?? 0,
        count: data.tasks?.length ?? 0,
        response: structuredClone(data),
      })
      return { tasks: (data.tasks ?? []) as ClickUpTask[] }
    } catch (error) {
      throw new Error(
        `ClickUp GET /team/${teamId}/task failed: ${JSON.stringify(error)}`,
      )
    }
  }

  async function findTaskInTeam(
    teamId: string,
    task: ClickUpTask,
  ): Promise<ClickUpTask | null> {
    const listId = task.list?.id
    if (!listId) return null

    const dateUpdatedMs = task.date_updated
      ? Number(task.date_updated)
      : Date.now()

    const baseParams: GetTeamTasksParams = {
      list_ids: [String(listId)],
      statuses: task.status?.status ? [task.status.status] : undefined,
      date_updated_gt: dateUpdatedMs - FIND_TASK_WINDOW_MS,
      include_closed: true,
      subtasks: true,
    }

    for (let page = 0; page < FIND_TASK_MAX_PAGES; page++) {
      const { tasks } = await getTeamTasks(teamId, { ...baseParams, page })
      const match = tasks.find((t) => t.id === task.id) ?? null
      if (match) return match
      if (tasks.length < 100) break
    }
    return null
  }

  async function getTimeEntries(
    teamId: string,
    params: GetTimeEntriesParams,
  ): Promise<{ data: ClickUpTimeEntry[] }> {
    const query: NonNullable<GetTimeEntriesWithinDateRangeData["query"]> = {}
    if (params.task_id) query.task_id = params.task_id
    // OpenAPI types `assignee` as number, but ClickUp accepts a comma-joined
    // string for multiple users — preserve that behaviour.
    if (params.assignee !== undefined)
      (query as Record<string, unknown>).assignee = params.assignee
    // OpenAPI types `space_id` as number, but ClickUp space ids are opaque
    // strings — pass through verbatim to filter time entries by space.
    if (params.space_id !== undefined)
      (query as Record<string, unknown>).space_id = params.space_id
    if (params.start_date !== undefined) query.start_date = params.start_date
    if (params.end_date !== undefined) query.end_date = params.end_date

    try {
      const { data } = await getTimeEntriesWithinDateRange({
        client,
        path: { team_Id: Number(teamId) },
        headers: { "Content-Type": "application/json" },
        query,
        throwOnError: true,
      })
      logger.info({
        call: "getTimeEntries",
        teamId,
        taskId: params.task_id,
        assignee: params.assignee,
        count: data.data?.length ?? 0,
        response: structuredClone(data),
      })
      return { data: (data.data ?? []) as ClickUpTimeEntry[] }
    } catch (error) {
      throw new Error(
        `ClickUp GET /team/${teamId}/time_entries failed: ${JSON.stringify(error)}`,
      )
    }
  }

  // ClickUp's personal API token can only see its own user's time entries
  // unless it belongs to a workspace admin. A comma-joined `assignee` query
  // 403s the whole request if any single user is out of scope, so fan out
  // per assignee and treat per-user TIMEENTRY_059 as "no visible entries".
  async function getTaskTimeEntriesPerAssignee(
    teamId: string,
    taskId: string,
    assigneeIds: number[],
    range?: { start_date?: number; end_date?: number },
  ): Promise<ClickUpTimeEntry[]> {
    if (assigneeIds.length === 0) return []

    const results = await Promise.all(
      assigneeIds.map(async (assigneeId) => {
        try {
          const { data } = await getTimeEntries(teamId, {
            task_id: taskId,
            assignee: String(assigneeId),
            start_date: range?.start_date,
            end_date: range?.end_date,
          })
          return data
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (message.includes("TIMEENTRY_059")) {
            logger.warn({
              warning: "time_entries_access_denied",
              taskId,
              assigneeId,
            })
            return [] as ClickUpTimeEntry[]
          }
          throw error
        }
      }),
    )
    return results.flat()
  }

  // Replaces the previous deep import of the generated `getList`. Non-throwing
  // by design: callers treat a missing list as `null` (list metadata is
  // best-effort), so a failed fetch must not abort the surrounding flow.
  async function getList(listId: string | number) {
    const { data } = await sdkGetList({
      client,
      path: { list_id: Number(listId) },
    })
    logger.info({ call: "getList", listId, name: data?.name })
    return data
  }

  // GET /team/{team_id}/space — every space carries a `members` array, which is
  // the source of users for the mirror. Throws on failure (sync depends on it).
  async function getSpaces(teamId: string): Promise<ClickUpSpace[]> {
    try {
      const { data } = await sdkGetSpaces({
        client,
        path: { team_id: Number(teamId) },
        throwOnError: true,
      })
      const spaces = (data.spaces ?? []) as ClickUpSpace[]
      logger.info({ call: "getSpaces", teamId, count: spaces.length })
      return spaces
    } catch (error) {
      throw new Error(
        `ClickUp GET /team/${teamId}/space failed: ${JSON.stringify(error)}`,
      )
    }
  }

  // GET /space/{space_id} — a single space. Note: unlike GET /team/{id}/space,
  // this response does NOT include `members`; consumers must source users from
  // `getSpaces`. Throws on failure (sync depends on it).
  async function getSpace(spaceId: string): Promise<ClickUpSpace> {
    try {
      const { data } = await sdkGetSpace({
        client,
        path: { space_id: Number(spaceId) },
        throwOnError: true,
      })
      logger.info({ call: "getSpace", spaceId, name: data?.name })
      return data as ClickUpSpace
    } catch (error) {
      throw new Error(
        `ClickUp GET /space/${spaceId} failed: ${JSON.stringify(error)}`,
      )
    }
  }

  // GET /space/{space_id}/folder — folders with their nested `lists`. The
  // OpenAPI spec mistypes `folders` as a single object whose `lists` is
  // `string[]`; the API actually returns an array of folders each with nested
  // List objects, so widen via `as unknown`. Throws on failure.
  async function getFolders(spaceId: string): Promise<ClickUpFolder[]> {
    try {
      const { data } = await sdkGetFolders({
        client,
        path: { space_id: Number(spaceId) },
        throwOnError: true,
      })
      const folders = (data.folders ?? []) as unknown as ClickUpFolder[]
      logger.info({ call: "getFolders", spaceId, count: folders.length })
      return folders
    } catch (error) {
      throw new Error(
        `ClickUp GET /space/${spaceId}/folder failed: ${JSON.stringify(error)}`,
      )
    }
  }

  // GET /space/{space_id}/list — lists that live directly under a space (no
  // folder). Throws on failure (sync depends on it).
  async function getFolderlessLists(spaceId: string): Promise<ClickUpList[]> {
    try {
      const { data } = await sdkGetFolderlessLists({
        client,
        path: { space_id: Number(spaceId) },
        throwOnError: true,
      })
      const lists = (data.lists ?? []) as ClickUpList[]
      logger.info({ call: "getFolderlessLists", spaceId, count: lists.length })
      return lists
    } catch (error) {
      throw new Error(
        `ClickUp GET /space/${spaceId}/list failed: ${JSON.stringify(error)}`,
      )
    }
  }

  // GET /folder/{folder_id}/list — lists inside a folder. Useful when the
  // nested `lists` from `getFolders` are incomplete. Throws on failure.
  async function getFolderLists(folderId: string): Promise<ClickUpList[]> {
    try {
      const { data } = await sdkGetLists({
        client,
        path: { folder_id: Number(folderId) },
        throwOnError: true,
      })
      const lists = (data.lists ?? []) as ClickUpList[]
      logger.info({ call: "getFolderLists", folderId, count: lists.length })
      return lists
    } catch (error) {
      throw new Error(
        `ClickUp GET /folder/${folderId}/list failed: ${JSON.stringify(error)}`,
      )
    }
  }

  // GET /list/{list_id}/task — the only endpoint exposing `archived` tasks
  // (GetFilteredTeamTasks has no `archived` param), so the mirror uses this to
  // pull archived items. Throws on failure (sync depends on it).
  async function getListTasks(
    listId: string,
    params: GetListTasksParams = {},
  ): Promise<{ tasks: ClickUpTask[]; last_page?: boolean }> {
    const query: NonNullable<GetTasksData["query"]> = {}
    if (params.archived !== undefined) query.archived = params.archived
    if (params.include_closed !== undefined)
      query.include_closed = params.include_closed
    if (params.subtasks !== undefined) query.subtasks = params.subtasks
    if (params.page !== undefined) query.page = params.page

    try {
      const { data } = await sdkGetTasks({
        client,
        path: { list_id: Number(listId) },
        query,
        throwOnError: true,
      })
      // The list-task item type is structurally a task but a distinct generated
      // type from the team-task items `ClickUpTask` builds on, so widen here.
      const tasks = (data.tasks ?? []) as unknown as ClickUpTask[]
      logger.info({
        call: "getListTasks",
        listId,
        archived: params.archived ?? false,
        page: params.page ?? 0,
        count: tasks.length,
      })
      return { tasks, last_page: data.last_page }
    } catch (error) {
      throw new Error(
        `ClickUp GET /list/${listId}/task failed: ${JSON.stringify(error)}`,
      )
    }
  }

  // POST /list/{list_id}/task — optional fields are omitted from the body when
  // not supplied so ClickUp applies its own defaults (notably: no `status`
  // means the list's first status). Throws on failure.
  async function createTask(
    listId: string,
    params: CreateTaskParams,
  ): Promise<ClickUpTask> {
    const body: CreateTaskData["body"] = { name: params.name }
    if (params.description !== undefined) body.description = params.description
    if (params.markdown_content !== undefined)
      body.markdown_content = params.markdown_content
    if (params.status !== undefined) body.status = params.status
    if (params.assignees !== undefined) body.assignees = params.assignees
    if (params.custom_item_id !== undefined)
      body.custom_item_id = params.custom_item_id

    const { data, error, response } = await sdkCreateTask({
      client,
      path: { list_id: Number(listId) },
      body,
    })
    if (!response?.ok) {
      throw new Error(
        `ClickUp POST /list/${listId}/task failed with ${describeFailure(response, error)}`,
      )
    }
    if (!data) {
      throw new Error(
        `ClickUp POST /list/${listId}/task returned ${response.status} with no task payload`,
      )
    }

    // The create-task response schema and the team-task schema `ClickUpTask`
    // builds on disagree, not just nominally: this one types `assignees` as
    // `string[]` (vs assignee objects), `priority` as an object (vs number),
    // `time_estimate` as `string | null` (vs number), and marks `id`/`url`
    // optional. The team-task shape matches what ClickUp actually returns, so
    // trust it over this section of the spec — the same call-site widening the
    // other helpers use. Unverified against a live create call; if a consumer
    // reports `assignees` arriving as ids, this is the line to revisit.
    const task = data as unknown as ClickUpTask
    logger.info({
      call: "createTask",
      listId,
      taskId: task.id,
      response: structuredClone(task),
    })
    return task
  }

  // POST /task/{task_id}/attachment — the only multipart endpoint here. The
  // generated `formDataBodySerializer` appends without a filename, which would
  // upload every file as "blob", so build the FormData explicitly and pass it
  // through unserialized. Throws on failure.
  async function createTaskAttachment(
    taskId: string,
    params: CreateTaskAttachmentParams,
  ): Promise<ClickUpAttachment> {
    const form = new FormData()
    form.append("attachment", params.file, params.filename)

    const { data, error, response } = await sdkCreateTaskAttachment({
      client,
      path: { task_id: taskId },
      // The spec types the body as `{ attachment?: unknown[] }`; the API
      // takes a single multipart file field, so widen to the built FormData.
      body: form as unknown as CreateTaskAttachmentData["body"],
      bodySerializer: (body) => body as FormData,
    })
    if (!response?.ok) {
      throw new Error(
        `ClickUp POST /task/${taskId}/attachment failed with ${describeFailure(response, error)}`,
      )
    }
    if (!data) {
      throw new Error(
        `ClickUp POST /task/${taskId}/attachment returned ${response.status} with no attachment payload`,
      )
    }

    logger.info({
      call: "createTaskAttachment",
      taskId,
      filename: params.filename,
      attachmentId: data.id,
    })
    return data
  }

  async function postComment(
    taskId: string,
    commentText: string,
  ): Promise<ClickUpComment> {
    try {
      const { data } = await createTaskComment({
        client,
        path: { task_id: taskId },
        body: { comment_text: commentText, notify_all: false },
        throwOnError: true,
      })
      return data
    } catch (error) {
      throw new Error(
        `ClickUp POST /task/${taskId}/comment failed: ${JSON.stringify(error)}`,
      )
    }
  }

  async function postCommentWithMention(
    taskId: string,
    params: {
      clickupUserId: number
      username: string
      messageBefore?: string
      messageAfter: string
    },
  ): Promise<ClickUpComment> {
    const comment: MentionPart[] = []
    if (params.messageBefore) comment.push({ text: params.messageBefore })
    comment.push({
      text: `${params.username}`,
      type: "tag_user",
      attributes: { user_id: params.clickupUserId },
    })
    comment.push({ text: params.messageAfter })

    // ClickUp accepts either `comment_text` (plain) or a `comment` array for
    // rich mentions; the OpenAPI spec only documents the former, so widen here.
    const body = {
      comment,
      assignee: params.clickupUserId,
      notify_all: false,
    } as unknown as { comment_text: string; notify_all: boolean }

    try {
      const { data } = await createTaskComment({
        client,
        path: { task_id: taskId },
        body,
        throwOnError: true,
      })
      logger.info({
        call: "postCommentWithMention",
        taskId,
        userId: params.clickupUserId,
        response: structuredClone(data),
      })
      return data
    } catch (error) {
      throw new Error(
        `ClickUp POST /task/${taskId}/comment failed: ${JSON.stringify(error)}`,
      )
    }
  }

  return {
    getTask,
    getTeamTasks,
    findTaskInTeam,
    getTimeEntries,
    getTaskTimeEntriesPerAssignee,
    getList,
    getSpaces,
    getSpace,
    getFolders,
    getFolderlessLists,
    getFolderLists,
    getListTasks,
    createTask,
    createTaskAttachment,
    postComment,
    postCommentWithMention,
  }
}
