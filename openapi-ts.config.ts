import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig([
  {
    // The whole v2 spec is generated. `input.include` is not a supported option
    // in @hey-api/openapi-ts 0.96.x — it is accepted and silently ignored, so a
    // regex here would look like it scopes generation while doing nothing.
    input: "./openapi/.generated/clickup-v2.json",
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
