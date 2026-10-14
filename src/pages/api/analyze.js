import { makeHandler } from "../../../server/handler.mjs";

// Keep raw streaming, size checks and disconnect cancellation in the shared handler.
export const config = { api: { bodyParser: false }, maxDuration: 60 };

export default makeHandler();
