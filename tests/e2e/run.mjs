// npm run e2e — starts a static server and the fake Supabase, then runs the browser scenarios.
import { spawn } from "node:child_process";
import { launch, sleep } from "./browser.mjs";

const webPort = 8765 + Math.floor(Math.random() * 100), fakePort = webPort + 1;
const web = spawn("python3", ["-m", "http.server", String(webPort)], { stdio: "ignore", cwd: new URL("../../", import.meta.url).pathname });
const fake = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", new URL("./fakeSupabaseServer.mjs", import.meta.url).pathname, String(fakePort)], { stdio: "ignore" });
await sleep(1200);
const browser = await launch();
let failed = 0;
try {
  for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ["local", "shared"]) {
    console.log(`\n== ${name}`);
    const { run } = await import(`./${name}.mjs`);
    try { await run({ makePage: browser.makePage, base: `http://localhost:${webPort}`, fake: `http://localhost:${fakePort}` }); }
    catch (e) { failed++; console.error("FAIL", e.message); }
  }
} finally { browser.close(); web.kill(); fake.kill(); }
console.log(failed ? `\n${failed} scenario(s) failed` : "\nall e2e scenarios passed");
process.exit(failed ? 1 : 0);
