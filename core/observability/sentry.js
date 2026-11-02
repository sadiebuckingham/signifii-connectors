// Error reporting (Sentry). Server side only here; the in-Claude view reports
// from the browser via core/mcp/app-shell. Off when SENTRY_DSN isn't set.
// No personal data: sendDefaultPii is off and request bodies aren't sent.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;
export const sentryOn = Boolean(dsn);
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || (process.env.NODE_ENV === "production" ? "demo" : "local"),
    release: process.env.RENDER_GIT_COMMIT || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) { delete event.request.data; delete event.request.cookies; if (event.request.headers) delete event.request.headers.authorization; }
      if (event.request?.url) event.request.url = event.request.url.replace(/\/(mcp\/[^/]+|p)\/[^/?]+/, "/$1/<token>");
      return event;
    },
  });
}

export function reportError(err, context = {}) {
  console.error(err);
  if (dsn) Sentry.captureException(err, { extra: context });
}

export function attachErrorHandler(app) { if (dsn) Sentry.setupExpressErrorHandler(app); }
