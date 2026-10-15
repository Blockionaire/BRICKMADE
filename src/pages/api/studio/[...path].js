import { makeStudioHandler } from "../../../../server/studio-handler.mjs";
export const config = { api: { bodyParser: false }, maxDuration: 30 };
export default makeStudioHandler();
