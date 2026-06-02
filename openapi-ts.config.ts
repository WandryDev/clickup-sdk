import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig([
  {
    input: {
      path: "./openapi/.generated/clickup-v2.json",
      include:
        "^(GetTask|GetList|GetSpace|GetFilteredTeamTasks|Gettimeentrieswithinadaterange|CreateTaskComment|CreateWebhook)$",
    },
    // clean: false preserves hand-written files (e.g. custom_types.ts) that
    // live alongside generated output. Generated files are still overwritten.
    output: { path: "./src/generated/v2", clean: false },
    plugins: ["@hey-api/client-fetch", "@hey-api/sdk", "@hey-api/typescript"],
  },
  {
    input: "./openapi/.generated/clickup-v3.json",
    output: { path: "./src/generated/v3", clean: false },
    plugins: ["@hey-api/client-fetch", "@hey-api/sdk", "@hey-api/typescript"],
  },
])
