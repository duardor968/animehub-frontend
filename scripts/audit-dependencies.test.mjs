import assert from "node:assert/strict";
import { test } from "node:test";
import { assessAudits, main, parseAudit } from "./audit-dependencies.mjs";

const advisory = (severity = "high", id = "GHSA-dev-only-test") => ({
  severity,
  module_name: "test-package",
  title: "Test advisory",
  url: `https://github.com/advisories/${id}`,
});
function result(advisories = {}, status = 0, counts) {
  const tally = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  if (counts) {
    Object.assign(tally, counts);
  } else {
    for (const item of Object.values(advisories)) {
      if (item && item.severity in tally) tally[item.severity] += 1;
    }
  }
  return {
    status,
    stdout: JSON.stringify({
      advisories,
      metadata: {
        vulnerabilities: tally,
      },
    }),
  };
}

test("development-only high findings remain visible but do not block", () => {
  const prod = parseAudit(result(), "production");
  const full = parseAudit(result({ one: advisory() }, 1), "all");
  const assessed = assessAudits(prod, full);
  assert.equal(assessed.development.length, 1);
  assert.equal(assessed.blocking.length, 0);
});

test("production high and critical findings block even if a tool incorrectly exits zero", () => {
  for (const severity of ["high", "critical"]) {
    const report = parseAudit(
      result({ one: advisory(severity) }),
      "production",
    );
    assert.equal(assessAudits(report, report).blocking.length, 1);
  }
});

test("production lower-severity findings are visible and non-blocking", () => {
  const report = parseAudit(
    result({ one: advisory("moderate") }),
    "production",
  );
  assert.equal(assessAudits(report, report).blocking.length, 0);
});

test("an advisory present in production and dev is classified as production", () => {
  const report = parseAudit(result({ one: advisory() }, 1), "production");
  assert.equal(assessAudits(report, report).development.length, 0);
});

test("registry, process and malformed-result failures cannot become informational warnings", () => {
  for (const invalid of [
    { status: null, stdout: "", error: new Error("timeout") },
    { status: 2, stdout: "{}" },
    { status: 1, stdout: "not JSON" },
    {
      status: 1,
      stdout: JSON.stringify({
        error: { code: "ERR_PNPM_AUDIT_BAD_RESPONSE" },
      }),
    },
    result({}, 1),
    {
      status: 0,
      stdout: JSON.stringify({
        advisories: {},
        metadata: { vulnerabilities: {} },
      }),
    },
    result({ one: { severity: "high" } }, 1),
    {
      status: 0,
      stdout: JSON.stringify({
        advisories: {},
        metadata: { vulnerabilities: { high: -1 } },
      }),
    },
  ]) {
    assert.throws(() => parseAudit(invalid, "audit"));
  }
});

test("pre-existing configured exclusions are disclosed instead of called zero findings", () => {
  const report = parseAudit(result({}, 0, { high: 1 }), "production");
  assert.equal(report.configuredExclusions, 1);
  assert.equal(report.nonBlockingOmitted, 0);
});

test("lower-severity advisories omitted by --audit-level high are not misreported as configured exclusions", () => {
  const report = parseAudit(
    result({}, 0, { info: 1, low: 2, moderate: 7 }),
    "production",
  );
  assert.equal(report.configuredExclusions, 0);
  assert.equal(report.nonBlockingOmitted, 10);
});

test("mixed exclusions and lower-severity advisories are counted separately", () => {
  const report = parseAudit(
    result({ one: advisory("high") }, 1, {
      low: 1,
      moderate: 4,
      high: 2,
      critical: 1,
    }),
    "all dependencies",
  );
  assert.equal(report.configuredExclusions, 2);
  assert.equal(report.nonBlockingOmitted, 5);
});

test("main does not emit a workspace exclusion warning for omitted moderate advisories", () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    const code = main((production) =>
      production
        ? result({}, 0, { moderate: 7 })
        : result({ one: advisory("high") }, 1, { moderate: 12, high: 1 }),
    );
    assert.equal(code, 0);
  } finally {
    console.log = originalLog;
  }
  assert.equal(
    lines.some((line) => line.includes("pnpm-workspace.yaml")),
    false,
  );
  assert.equal(
    lines.some((line) =>
      line.includes("production: 7 non-blocking lower-severity"),
    ),
    true,
  );
  assert.equal(
    lines.some((line) =>
      line.includes("all dependencies: 12 non-blocking lower-severity"),
    ),
    true,
  );
});
