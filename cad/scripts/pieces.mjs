// Write one part file per printable module (parts/modules/), so each exports
// to a file of its own. Run by `export`; run it by hand after adding a
// subsystem.
import { mkdirSync, writeFileSync } from "node:fs";
import { SUBSYSTEM_CONFIGS, canInstallInSlot } from "@dangerous-inclinations/engine";

const types = Object.keys(SUBSYSTEM_CONFIGS).filter(
  (t) => canInstallInSlot(t, "side") || canInstallInSlot(t, "forward")
);
mkdirSync("parts/modules", { recursive: true });
for (const t of types)
  writeFileSync(
    `parts/modules/${t}.part.js`,
    `import { part } from "fluidcad/core";\nimport { buildModule, screwFor } from "../../pieces/module.ts";\n\nexport const module = part(\`${t} (M2 screw up to \${screwFor("${t}")} mm)\`, () => buildModule("${t}"));\n`
  );
