// Runs every role module on a parsed document. Each role file owns its checks; this file only aggregates.
import eic from "./eic.js";
import methods from "./methods.js";
import finance from "./finance.js";
import business from "./business.js";
import production from "./production.js";
import ethics from "./ethics.js";
import response from "./response.js";

export const ROLES = { eic, methods, finance, business, production, ethics, response };

export async function runAll(doc, { only, ...opts } = {}) {
  const out = [];
  for (const [name, mod] of Object.entries(ROLES)) {
    if (only && !only.includes(name)) continue;
    out.push(...(await mod.run(doc, opts)));
  }
  return out;
}
export default { ROLES, runAll };
