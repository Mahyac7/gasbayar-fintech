import { createApp } from "./api";

/**
 * Local development server. On Vercel the app is served via api/index.ts as a
 * serverless function instead — this file is only used for `npm run dev` /
 * `npm start` locally.
 */
const PORT = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Gasbayar transfer API listening on http://localhost:${PORT}`);
});
