import { createClient, createConfig } from "./generated/v2/client"
import { type ClickUpContext, createHelpers } from "./helpers"
import { type ClickUpLogger, noopLogger } from "./logger"

export interface CreateClickUpOptions {
  /** ClickUp personal API token, sent as the `Authorization` header. */
  token: string
  /** Optional structured logger. Defaults to a no-op. */
  logger?: ClickUpLogger
  /** Override the API base URL (e.g. for tests). */
  baseUrl?: string
}

export type ClickUpClient = ReturnType<typeof createHelpers>

const DEFAULT_BASE_URL = "https://api.clickup.com/api"

export function createClickUp(options: CreateClickUpOptions): ClickUpClient {
  const { token, logger = noopLogger, baseUrl = DEFAULT_BASE_URL } = options

  const v2 = createClient(
    createConfig({ baseUrl, headers: { Authorization: token } }),
  )

  v2.interceptors.response.use((response, request) => {
    const url = new URL(request.url)
    logger.info({
      version: "v2",
      method: request.method,
      path: `${url.pathname}${url.search}`,
      status: response.status,
    })
    return response
  })

  const context: ClickUpContext = { v2, logger }
  return createHelpers(context)
}
