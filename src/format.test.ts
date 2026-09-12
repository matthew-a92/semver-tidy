// Minimal self-contained test runner. No test framework dependency: just
// plain functions, thrown errors on mismatch, and a pass/fail tally printed
// at the end. `console` and `process` are Node globals at runtime; they're
// declared here instead of pulling in @types/node.

import { formatVersion, formatVersions, compareVersions, type FormatResult } from "./format.js";

declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
declare const process: { exitCode: number };

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assertOk(result: FormatResult, expected: string): void {
  if (!result.ok) {
    throw new Error(`expected ok("${expected}"), got fail("${result.reason}")`);
  }
  if (result.value !== expected) {
    throw new Error(`expected "${expected}", got "${result.value}"`);
  }
}

function assertFail(result: FormatResult): void {
  if (result.ok) {
    throw new Error(`expected a failure, got ok("${result.value}")`);
  }
}

// --- core: major.minor.patch ---

test("bare major fills in minor and patch", () => {
  assertOk(formatVersion("1"), "1.0.0");
});

test("major.minor fills in patch", () => {
  assertOk(formatVersion("1.2"), "1.2.0");
});

test("full core passes through", () => {
  assertOk(formatVersion("1.2.3"), "1.2.3");
});

test("leading zeros in core components are stripped", () => {
  assertOk(formatVersion("01.02.03"), "1.2.3");
});

test("a lone zero component stays zero", () => {
  assertOk(formatVersion("0.0.0"), "0.0.0");
});

test("a run of zeros collapses to a single zero", () => {
  assertOk(formatVersion("00.000.0"), "0.0.0");
});

test("leading v prefix is stripped", () => {
  assertOk(formatVersion("v1.2.3"), "1.2.3");
});

test("leading V prefix is stripped", () => {
  assertOk(formatVersion("V1.2.3"), "1.2.3");
});

test("surrounding whitespace is trimmed", () => {
  assertOk(formatVersion("  1.2.3  "), "1.2.3");
});

test("empty input is rejected", () => {
  assertFail(formatVersion(""));
});

test("whitespace-only input is rejected", () => {
  assertFail(formatVersion("   "));
});

test("more than three core components is rejected", () => {
  assertFail(formatVersion("1.2.3.4"));
});

test("a non-numeric core component is rejected", () => {
  assertFail(formatVersion("1.x.3"));
});

test("a trailing dot leaves an empty core component and is rejected", () => {
  assertFail(formatVersion("1."));
});

test("just a v prefix with nothing after it is rejected", () => {
  assertFail(formatVersion("v"));
});

// --- prerelease ---

test("prerelease identifiers pass through", () => {
  assertOk(formatVersion("1.2.3-alpha"), "1.2.3-alpha");
});

test("leading zeros in numeric prerelease identifiers are stripped", () => {
  assertOk(formatVersion("1.2.3-Beta.01"), "1.2.3-Beta.1");
});

test("alphanumeric prerelease identifiers are kept as-is", () => {
  assertOk(formatVersion("1.2.3-x7z"), "1.2.3-x7z");
});

test("hyphens inside a prerelease identifier are allowed", () => {
  assertOk(formatVersion("1.2.3-alpha-beta.1"), "1.2.3-alpha-beta.1");
});

test("multiple dot-separated prerelease identifiers all normalize", () => {
  assertOk(formatVersion("1.2.3-alpha.0.01.beta"), "1.2.3-alpha.0.1.beta");
});

test("an empty prerelease after the hyphen is rejected", () => {
  assertFail(formatVersion("1.2.3-"));
});

test("an empty prerelease identifier between dots is rejected", () => {
  assertFail(formatVersion("1.2.3-alpha..beta"));
});

test("an invalid character in a prerelease identifier is rejected", () => {
  assertFail(formatVersion("1.2.3-alpha_beta"));
});

// --- build metadata ---

test("build metadata passes through verbatim", () => {
  assertOk(formatVersion("1.2.3+Build.007"), "1.2.3+Build.007");
});

test("leading zeros in build metadata are NOT stripped", () => {
  assertOk(formatVersion("1.2.3+007"), "1.2.3+007");
});

test("an empty build metadata after the plus is rejected", () => {
  assertFail(formatVersion("1.2.3+"));
});

test("an empty build metadata identifier between dots is rejected", () => {
  assertFail(formatVersion("1.2.3+build..007"));
});

test("an invalid character in build metadata is rejected", () => {
  assertFail(formatVersion("1.2.3+build_007"));
});

// --- combined and real-world-ish inputs ---

test("prerelease and build metadata together", () => {
  assertOk(formatVersion(" 01.02.03-Beta.01+Build.007 "), "1.2.3-Beta.1+Build.007");
});

test("v prefix with missing minor/patch, prerelease, and build", () => {
  assertOk(formatVersion("v1-rc.1+exp"), "1.0.0-rc.1+exp");
});

// --- formatVersions batch helper ---

test("formatVersions preserves order and mixes successes with failures", () => {
  const results = formatVersions(["v1.0", "not-a-version", "2.0.0"]);
  if (results.length !== 3) {
    throw new Error(`expected 3 results, got ${results.length}`);
  }
  assertOk(results[0]!, "1.0.0");
  assertFail(results[1]!);
  assertOk(results[2]!, "2.0.0");
});

test("formatVersions on an empty list returns an empty list", () => {
  const results = formatVersions([]);
  if (results.length !== 0) {
    throw new Error(`expected 0 results, got ${results.length}`);
  }
});

// --- compareVersions ---

function assertOrder(a: string, b: string, expected: -1 | 0 | 1): void {
  const cmp = compareVersions(a, b);
  const sign = cmp === 0 ? 0 : cmp < 0 ? -1 : 1;
  if (sign !== expected) {
    throw new Error(`expected compareVersions("${a}", "${b}") to be ${expected}, got ${cmp}`);
  }
  // The comparison must be antisymmetric.
  const reverseCmp = compareVersions(b, a);
  const reverseSign = reverseCmp === 0 ? 0 : reverseCmp < 0 ? -1 : 1;
  if (reverseSign !== -expected) {
    throw new Error(
      `expected compareVersions("${b}", "${a}") to be ${-expected}, got ${reverseCmp}`,
    );
  }
}

test("equal versions compare equal", () => {
  assertOrder("1.2.3", "1.2.3", 0);
});

test("major version takes precedence", () => {
  assertOrder("1.2.3", "2.0.0", -1);
});

test("minor version breaks a major tie", () => {
  assertOrder("1.2.3", "1.3.0", -1);
});

test("patch version breaks a minor tie", () => {
  assertOrder("1.2.3", "1.2.4", -1);
});

test("a release has higher precedence than its prerelease", () => {
  assertOrder("1.2.3-alpha", "1.2.3", -1);
});

test("numeric prerelease identifiers compare numerically, not lexically", () => {
  assertOrder("1.2.3-alpha.2", "1.2.3-alpha.10", -1);
});

test("numeric prerelease identifiers have lower precedence than alphanumeric ones", () => {
  assertOrder("1.2.3-1", "1.2.3-alpha", -1);
});

test("alphanumeric prerelease identifiers compare lexically", () => {
  assertOrder("1.2.3-alpha", "1.2.3-beta", -1);
});

test("a shorter prerelease identifier list has lower precedence when a common prefix is equal", () => {
  assertOrder("1.2.3-alpha", "1.2.3-alpha.1", -1);
});

test("build metadata is ignored for precedence", () => {
  assertOrder("1.2.3+build.1", "1.2.3+build.2", 0);
});

test("compareVersions is usable as an Array.prototype.sort comparator", () => {
  const sorted = ["2.0.0", "1.0.0-alpha", "1.0.0", "1.0.0-alpha.1"].sort(compareVersions);
  if (sorted.join(",") !== "1.0.0-alpha,1.0.0-alpha.1,1.0.0,2.0.0") {
    throw new Error(`unexpected sort order: ${sorted.join(",")}`);
  }
});

test("compareVersions throws on a non-canonical string", () => {
  let threw = false;
  try {
    compareVersions("v1.2.3", "1.2.3");
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("expected compareVersions to throw on a non-canonical input");
  }
});

if (failed > 0) {
  console.error(`${failed} of ${passed + failed} tests failed`);
  process.exitCode = 1;
} else {
  console.log(`${passed} tests passed`);
}
