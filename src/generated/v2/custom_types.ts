// Hand-written type aliases and extensions for the v2 SDK.
// Preserved across codegen runs via `output.clean: false` in openapi-ts.config.ts.

import type {
  PathsV2SpaceSpaceIdFolderGetResponses200ContentApplicationJsonSchemaPropertiesFolders,
  PathsV2SpaceSpaceIdListGetResponses200ContentApplicationJsonSchemaPropertiesListsItems,
  PathsV2TaskTaskIdAttachmentPostResponses200ContentApplicationJsonSchema,
  PathsV2TaskTaskIdCommentGetResponses200ContentApplicationJsonSchemaPropertiesCommentsItems,
  PathsV2TaskTaskIdCommentPostResponses200ContentApplicationJsonSchema,
  PathsV2TaskTaskIdGetResponses200ContentApplicationJsonSchema,
  PathsV2TaskTaskIdTimeInStatusGetResponses200ContentApplicationJsonSchema,
  PathsV2TeamGetResponses200ContentApplicationJsonSchemaPropertiesTeamsItems,
  PathsV2TeamTeamIdTimeEntriesCurrentGetResponses200ContentApplicationJsonSchemaPropertiesData,
  PathsV2TeamTeamIdSpaceGetResponses200ContentApplicationJsonSchemaPropertiesSpacesItems,
  PathsV2TeamTeamIdTaskGetResponses200ContentApplicationJsonSchemaPropertiesTasksItems,
  PathsV2TeamTeamIdTimeEntriesGetResponses200ContentApplicationJsonSchemaPropertiesDataItems,
  PathsV2TeamTeamIdWebhookPostResponses200ContentApplicationJsonSchema,
} from "./types.gen"

export type TimeEstimateByUser = {
  user: {
    id: number
    username: string
    email: string
    color: string
    initials: string
    profilePicture: string | null
  }
  time_estimate: number
}

// ClickUp returns this extra field on team-task responses that the OpenAPI
// spec doesn't document. Extend the generated type rather than drop precision.
export type ClickUpTask =
  & PathsV2TeamTeamIdTaskGetResponses200ContentApplicationJsonSchemaPropertiesTasksItems
  & Partial<PathsV2TaskTaskIdGetResponses200ContentApplicationJsonSchema>
  & {
    time_estimates_by_user?: TimeEstimateByUser[]
  }

export type ClickUpTimeEntry =
  PathsV2TeamTeamIdTimeEntriesGetResponses200ContentApplicationJsonSchemaPropertiesDataItems

export type ClickUpComment =
  PathsV2TaskTaskIdCommentPostResponses200ContentApplicationJsonSchema

// A workspace as returned by GET /team. The v2 API calls workspaces "teams";
// `id` is the `team_id` every team-scoped endpoint takes.
export type ClickUpWorkspace =
  PathsV2TeamGetResponses200ContentApplicationJsonSchemaPropertiesTeamsItems

// A comment as returned by GET /task/{task_id}/comment and
// GET /comment/{comment_id}/reply. Distinct from `ClickUpComment`, which is the
// thin `{ id, hist_id, date }` acknowledgement POST returns.
export type ClickUpTaskComment =
  PathsV2TaskTaskIdCommentGetResponses200ContentApplicationJsonSchemaPropertiesCommentsItems

// GET /task/{task_id}/time_in_status — the current status plus every status
// the task has passed through, each with its accumulated time.
export type ClickUpTimeInStatus =
  PathsV2TaskTaskIdTimeInStatusGetResponses200ContentApplicationJsonSchema

// The timer GET /team/{team_id}/time_entries/current reports as running.
// `duration` is negative while it runs; derive elapsed time from `start`
// (`Date.now() - Number(start)`). The spec marks `task` as required, but
// ClickUp allows timers that are not tied to a task, so it is optional here.
export type ClickUpRunningTimeEntry = Omit<
  PathsV2TeamTeamIdTimeEntriesCurrentGetResponses200ContentApplicationJsonSchemaPropertiesData,
  "task"
> & {
  task?: PathsV2TeamTeamIdTimeEntriesCurrentGetResponses200ContentApplicationJsonSchemaPropertiesData["task"]
}

export type ClickUpWebhook =
  PathsV2TeamTeamIdWebhookPostResponses200ContentApplicationJsonSchema

// An attachment as returned by POST /task/{task_id}/attachment.
export type ClickUpAttachment =
  PathsV2TaskTaskIdAttachmentPostResponses200ContentApplicationJsonSchema

// GET /team/{team_id}/space returns each space WITH a `members` array — the
// source of users for the mirror. GET /space/{space_id} returns the same shape
// MINUS `members` (hence `members?` is optional). Previously a minimal
// {id,name}; widened to the full generated shape so consumers can read members.
export type ClickUpSpace =
  PathsV2TeamTeamIdSpaceGetResponses200ContentApplicationJsonSchemaPropertiesSpacesItems

// A list as returned by GET /space/{space_id}/list and GET /folder/{folder_id}/list.
export type ClickUpList =
  PathsV2SpaceSpaceIdListGetResponses200ContentApplicationJsonSchemaPropertiesListsItems

// The OpenAPI spec types the `folder` payload as a single object whose `lists`
// is `string[]`, but the real API returns an array of folders, each carrying an
// array of nested List objects. Override `lists` with the proper List type; the
// "object vs array" mismatch is widened at the call site in `getFolders`.
export type ClickUpFolder = Omit<
  PathsV2SpaceSpaceIdFolderGetResponses200ContentApplicationJsonSchemaPropertiesFolders,
  "lists"
> & {
  lists: ClickUpList[]
}

// Тело, которое шлёт ClickUp Automation "Call webhook". Отличается от inbound
// API-webhook: данные задачи лежат в payload. Не часть REST OpenAPI-спеки
// (спека описывает только создание webhook, не входящие события), поэтому
// тип задаётся вручную здесь.
export type ClickupWebhookBody = {
  auto_id?: string
  trigger_id?: string
  payload?: {
    id?: string
    // допускаем альтернативные имена поля id на случай отличий в payload
    task_id?: string
  }
  // фолбэк, если id окажется на верхнем уровне
  task_id?: string
}
