// Write one part file per printable module and bell (parts/modules/,
// parts/bells/), so each exports to a file of its own. Run by `export`; run
// it by hand after adding a subsystem or a bell.
import { mkdirSync, writeFileSync } from "node:fs";
import { SUBSYSTEM_CONFIGS, canInstallInSlot } from "@dangerous-inclinations/engine";

/** How many bells each hull hangs (`CORVETTE.bells[3]`, and the shrike's and mantis's clusters of five). */
const BELLS = { corvette: 3, shrike: 5, mantis: 5 };
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
for (const [hull, n] of Object.entries(BELLS))
  for (let i = 0; i < n; i++)
    writeFileSync(
      `parts/bells/${hull}-bell-${i}.part.js`,
      `import { part } from "fluidcad/core";\nimport { buildBell } from "../../pieces/bells.ts";\n\nexport const bell = part("${hull} bell ${i}", () => buildBell("${hull}", ${i}));\n`
    );
