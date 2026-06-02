import type {
  GetFilteredTeamTasksData,
  GetTimeEntriesWithinDateRangeData,
} from "./generated/v2"
import {
  createTaskComment,
  getFilteredTeamTasks,
  getTimeEntriesWithinDateRange,
  getList as sdkGetList,
  getTask as sdkGetTask,
} from "./generated/v2"
import type { Client } from "./generated/v2/client"
import type {
  ClickUpComment,
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
  start_date?: number
  end_date?: number
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
    postComment,
    postCommentWithMention,
  }
}
