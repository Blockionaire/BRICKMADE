import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync(".api-public", { recursive: true });
writeFileSync(
  ".api-public/index.html",
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>BrickMade private API</title><p>BrickMade private photo interpretation service. Use the BrickMade app to connect.</p></html>',
);
