// Item 5: evidence_ledger allows an empty grade or "—" when the status is NOT_IDENTIFIED.
import { assert, EV } from "./_lib.js";
for (const g of ["—", ""]) {
  const r = EV.checkLedger(EV.template() + `C009,"Service-level margin of integrated studios",,,,,,,RO,,,fitness,WB-EMS,integrated,service offering,2019-2025,,,,,${g},NOT_IDENTIFIED,no service-level accounts exist,,,no,\n`);
  assert.ok(!r.issues.some(i => i.claim_id === "C009" && i.severity === "high"), `grade '${g}'`);
}
