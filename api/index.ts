import { createApp } from "../src/api";

/**
 * Vercel serverless entrypoint.
 *
 * Vercel routes all requests (via vercel.json) to this function, which exports
 * the Express app. We do NOT call app.listen() here — Vercel invokes the
 * exported handler per request. The app lazily seeds its in-memory ledger on
 * each request (see src/api.ts), so cold starts still work.
 */
const app = createApp();

export default app;
