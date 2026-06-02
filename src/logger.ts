// Minimal logging interface so the package stays framework-agnostic.
// The host injects an adapter (e.g. over evlog); when omitted, logging is a
// no-op. `info` is for per-call structured logs, `warn` for recoverable
// conditions (e.g. per-assignee access denied).
export interface ClickUpLogger {
  info(data: Record<string, unknown>): void
  warn(data: Record<string, unknown>): void
}

export const noopLogger: ClickUpLogger = {
  info() {},
  warn() {},
}
