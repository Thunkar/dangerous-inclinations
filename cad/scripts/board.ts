// Write one part file per printable piece of the board (parts/board/<well>/),
// so each exports to a file of its own. Run by `export`; by hand, `yarn board`.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { partsOf, type WellKind } from "../pieces/well.ts";
import { BODIES } from "../pieces/body.ts";

for (const kind of ["blackHole", "planet"] as WellKind[]) {
  const dir = `parts/board/${kind}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const parts = [...partsOf(kind), ...BODIES[kind]];
  for (const p of parts) {
    const fn = p.call.slice(0, p.call.indexOf("("));
    const from = fn === "buildBody" ? "body" : "well";
    writeFileSync(
      `${dir}/${p.file}.part.js`,
      `import { part } from "fluidcad/core";\nimport { ${fn} } from "../../../pieces/${from}.ts";\n\nexport const piece = part(${JSON.stringify(p.name)}, () => ${p.call});\n`
    );
  }
  console.log(`${dir}: ${parts.length} parts`);
}
