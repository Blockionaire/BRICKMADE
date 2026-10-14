import { makeHandler } from "../../../server/handler.mjs";

export const config = { api: { bodyParser: false }, maxDuration: 60 };

export default makeHandler();
