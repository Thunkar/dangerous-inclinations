// Write one part file per printable module and bell (parts/modules/,
// parts/bells/), so each exports to a file of its own. Run by `export`; run
// it by hand after adding a subsystem or a bell.
import { mkdirSync, writeFileSync } from "node:fs";
import { SUBSYSTEM_CONFIGS, canInstallInSlot } from "@dangerous-inclinations/engine";

const BELLS = 3;
const types = Object.keys(SUBSYSTEM_CONFIGS).filter(
  (t) => canInstallInSlot(t, "side") || canInstallInSlot(t, "forward")
);
mkdirSync("parts/modules", { recursive: true });
mkdirSync("parts/bells", { recursive: true });
for (const t of types)
  writeFileSync(
    `parts/modules/${t}.part.js`,
    `import { part } from "fluidcad/core";\nimport { buildModule } from "../../pieces/module.ts";\n\nexport const module = part("${t}", () => buildModule("${t}"));\n`
  );
for (let i = 0; i < BELLS; i++)
  writeFileSync(
    `parts/bells/bell-${i}.part.js`,
    `import { part } from "fluidcad/core";\nimport { buildBell } from "../../pieces/bells.ts";\n\nexport const bell = part("Bell ${i}", () => buildBell(${i}));\n`
  );
