// What failed while building a part: `node scripts/errors.mjs <file.part.js>`
// lists the features that report an error, with their line and message (the
// export CLI does not say).
import { withServer } from "./server.mjs";

const [entry] = process.argv.slice(2);
await withServer(entry, async (port) => {
  const summary = await (await fetch(`http://localhost:${port}/api/scene/summary`)).json();
  const bad = summary.objects.filter((o) => o.hasError);
  console.log(`${summary.objects.length} features, ${bad.length} with errors`);
  for (const o of bad.slice(0, 30)) {
    const { hasError, sourceLocation, ...rest } = o;
    void hasError;
    const extra = Object.entries(rest)
      .filter(([k]) => /error|message|reason/i.test(k))
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(" ");
    console.log(
      `#${o.index} ${o.kind} ${sourceLocation?.filePath?.split("/").pop()}:${sourceLocation?.line} ${extra}`
    );
  }
});
