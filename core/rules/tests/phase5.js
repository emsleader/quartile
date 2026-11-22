// Structural tests for the ethics and data office (Phase 5, specification Section 10). Each returns
// { ok, anchor, detail }; ok: false raises the rule. Detectors live in core/roles/ethics_lib.js.
import E from "../../roles/ethics_lib.js";

const noHumans = doc => E.noHumanParticipants(doc);

export default {
  /** ETH-01: approval statement with a named body and a reference number, unless a waiver or "no human participants" is stated. */
  eth_approval(doc) {
    const nh = noHumans(doc); if (nh) return { ok: true, anchor: nh, detail: { exit: "no human participants stated" } };
    const w = E.waiverSentence(doc); if (w) return { ok: true, anchor: w, detail: { exit: "waiver stated" } };
    const a = E.approvalStatus(doc);
    const missing = a.found ? [!a.body && "named approving body", !a.reference && "reference number"].filter(Boolean) : ["approval statement"];
    return { ok: missing.length === 0, anchor: a.sentence, detail: { missing, approval_found: a.found } };
  },
  /** ETH-02: informed consent described (or waived, or no human participants). */
  eth_consent(doc) {
    const nh = noHumans(doc); if (nh) return { ok: true, anchor: nh, detail: { exit: "no human participants stated" } };
    const c = E.consentSentence(doc) || (E.waiverSentence(doc) && /consent/i.test(E.waiverSentence(doc).text) ? E.waiverSentence(doc) : null);
    return { ok: !!c, anchor: c, detail: { missing: c ? [] : ["consent statement"] } };
  },
  /** ETH-03: for participants in the EU/EEA, GDPR legal basis, pseudonymisation and storage period. */
  eth_data_protection(doc) {
    const eu = E.euParticipants(doc); if (!eu) return { ok: true, anchor: null, detail: { eu: false } };
    if (noHumans(doc)) return { ok: true, anchor: eu, detail: { exit: "no human participants stated" } };
    const d = E.dataProtection(doc); if (d.no_personal_data) return { ok: true, anchor: eu, detail: { exit: "no personal data collected" } };
    const missing = [!d.legal_basis && "GDPR legal basis", !d.pseudonymisation && "pseudonymisation or anonymisation", !d.storage_period && "storage period"].filter(Boolean);
    return { ok: missing.length === 0, anchor: eu, detail: { eu: true, missing } };
  },
  /** ETH-05: data and code availability statement (heading or sentence). */
  eth_availability(doc) { const s = E.availabilitySentence(doc); return { ok: !!s, anchor: s && s.id ? s : null, detail: { missing: s ? [] : ["data availability statement"] } }; },
  /** ETH-06: funding statement (heading or sentence). */
  eth_funding(doc) { const s = E.fundingSentence(doc); return { ok: !!s, anchor: s && s.id ? s : null, detail: { missing: s ? [] : ["funding statement"] } }; },
};
