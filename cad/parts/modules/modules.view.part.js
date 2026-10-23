import { part } from "fluidcad/core";
import { buildModule, MODULE_TYPES } from "../../pieces/module.ts";

export const modules = MODULE_TYPES.map((type, i) => part(type, () => buildModule(type, i * 30)));
