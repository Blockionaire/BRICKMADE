import { makeStudioHandler } from "../../../../server/studio-handler.mjs";
export const config = { api: { bodyParser: false }, maxDuration: 60 };
export default makeStudioHandler();
