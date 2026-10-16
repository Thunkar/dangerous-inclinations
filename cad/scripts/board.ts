// Write one part file per printable piece of the board (parts/board/<well>/),
// so each exports to a file of its own. Run by `export`; by hand, `yarn board`.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { boardParts } from "../pieces/well.ts";
import { BODIES } from "../pieces/body.ts";

const parts = [...boardParts(), ...BODIES];
for (const dir of new Set(parts.map((p) => p.dir))) {
  rmSync(`parts/board/${dir}`, { recursive: true, force: true });
  mkdirSync(`parts/board/${dir}`, { recursive: true });
}
for (const p of parts) {
  const fn = p.call.slice(0, p.call.indexOf("("));
  const from = fn === "buildBody" ? "body" : "well";
  writeFileSync(
    `parts/board/${p.dir}/${p.file}.part.js`,
    `import { part } from "fluidcad/core";\nimport { ${fn} } from "../../../pieces/${from}.ts";\n\nexport const piece = part(${JSON.stringify(p.name)}, () => ${p.call});\n`
  );
}
for (const dir of new Set(parts.map((p) => p.dir)))
  console.log(`parts/board/${dir}: ${parts.filter((p) => p.dir === dir).length} parts`);
