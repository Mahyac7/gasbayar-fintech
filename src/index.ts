import { initSchema } from "./db";
import { createApp } from "./api";

const PORT = Number(process.env.PORT || 3000);

initSchema();
const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Flip MVP transfer API listening on http://localhost:${PORT}`);
});
