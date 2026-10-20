import assert from "node:assert/strict";
import test from "node:test";
import {
  loadOciControllerEvidence,
  parseOciComputeReport,
} from "../lib/oci-controller-activity";

const at = "2026-10-20T01:16:02Z";
const title = "OCI REMOTE: compute";
const body = [
  "## OCI remote management: OCI REMOTE: compute",
  "UTC: 2026-10-20 01:15",
  "- Controller VM discovery: NOT_FOUND_IN_ENUMERATED_ACCESSIBLE_SCOPES",
  "- Accessible compartment scopes checked: 2",
  "- Scopes fully listed: 2",
  "- Compute records examined: 0",
  "- Coverage: COMPLETE only within compartments accessible to this OCI principal",
  "- OCI APPLY: DISABLED; fingerprints never authorize instance actions",
].join("\n") + "\n";

test("OCI report maps Issue #31 to historical scoped discovery only", () => {
  const result = parseOciComputeReport(title, 31, body, at);
  assert.ok(result);
  assert.equal(result.source, "snapshot");
  assert.equal(result.discovery, "not_found");
  assert.equal(result.coverage, "complete_accessible");
  assert.equal(result.scopesChecked, 2);
  assert.equal(result.scopesComplete, 2);
  assert.equal(result.recordsChecked, 0);
  assert.equal(result.apply, "disabled");
  assert.equal(result.checkedAt, "2026-10-20T01:16:02.000Z");
  assert.equal(result.issueUrl, "https://github.com/harisnukurniawan-star/oci-vm-retry/issues/31");
  assert.ok(!("healthy" in result));
  assert.ok(!("ocid" in result));
});

test("unrecognized titles and data bodies never become OCI evidence", () => {
  assert.equal(parseOciComputeReport("OCI PLAN: compute", 31, body, at), null);
  assert.equal(parseOciComputeReport(title, 31, "other text", at), null);
  assert.equal(parseOciComputeReport(title, -1, body, at), null);
  assert.equal(parseOciComputeReport(title, 31, body, "invalid"), null);
  assert.equal(parseOciComputeReport(title, 31,
    body.replace("Accessible compartment scopes checked: 2", "Accessible compartment scopes checked: 2;TOKEN=abc"), at), null);
});

test("incomplete scope downgrades not-found to partial", () => {
  const incomplete = body
    .replace("Scopes fully listed: 2", "Scopes fully listed: 1");
  const parsed = parseOciComputeReport(title, 31, incomplete, at);
  assert.equal(parsed?.coverage, "partial");
  assert.equal(parsed?.discovery, "partial");
});

test("raw secrets and untrusted OCI IDs are never exported", () => {
  const malicious = body + "- Full OCID: ocid1.instance.secret\n- Token: abc\n";
  const parsed = parseOciComputeReport(title, 31, malicious, at);
  assert.ok(parsed);
  const publicJson = JSON.stringify(parsed);
  assert.ok(!publicJson.includes("ocid1.instance"));
  assert.ok(!publicJson.includes("Token"));
  assert.ok(!publicJson.includes("abc"));
});

test("server fails closed when dedicated GitHub credential is absent", async () => {
  const key = "OCI_CONTROLLER_GITHUB_TOKEN";
  const previous = process.env[key];
  delete process.env[key];
  try {
    const evidence = await loadOciControllerEvidence();
    assert.equal(evidence.source, "unavailable");
    assert.equal(evidence.discovery, "unverified");
    assert.equal(evidence.scopesChecked, null);
    assert.equal(evidence.issueUrl, "");
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
