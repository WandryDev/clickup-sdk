// Hand-written type aliases and extensions for the v2 SDK.
// Preserved across codegen runs via `output.clean: false` in openapi-ts.config.ts.

import type {
  PathsV2TaskTaskIdCommentPostResponses200ContentApplicationJsonSchema,
  PathsV2TaskTaskIdGetResponses200ContentApplicationJsonSchema,
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

export type ClickUpWebhook =
  PathsV2TeamTeamIdWebhookPostResponses200ContentApplicationJsonSchema

export type ClickUpSpace = {
  id: string
  name: string
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
