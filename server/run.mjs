import { createServer } from "node:http";
import { makeHandler } from "./handler.mjs";
const port = Number(process.env.PORT || 8787);
createServer(makeHandler()).listen(port, "0.0.0.0", () => {
  console.log(`BrickMade private AI service listening on port ${port}.`);
});
