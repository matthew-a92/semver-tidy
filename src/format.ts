// Normalizes messy version strings ("v1.2", " 1.02.3-Beta.01+Build.007 ", ...)
// into canonical semver ("1.2.0", "1.2.3-Beta.1+Build.007").
//
// The rules here are intentionally a bit more lenient than the semver spec
// on input (missing components, leading zeros, a "v" prefix) but the output
// is always either strict semver or a rejection with a reason.

export interface FormatSuccess {
  readonly ok: true;
  readonly value: string;
}

export interface FormatFailure {
  readonly ok: false;
  readonly reason: string;
}

export type FormatResult = FormatSuccess | FormatFailure;

const IDENTIFIER_CHARS = /^[0-9A-Za-z-]+$/;
const DIGITS_ONLY = /^[0-9]+$/;

function ok(value: string): FormatSuccess {
  return { ok: true, value };
}

function fail(reason: string): FormatFailure {
  return { ok: false, reason };
}

function splitOnFirst(input: string, separator: string): [string, string | null] {
  const index = input.indexOf(separator);
  if (index === -1) {
    return [input, null];
  }
  return [input.slice(0, index), input.slice(index + 1)];
}

function stripLeadingVPrefix(input: string): string {
  return input.length > 0 && (input[0] === "v" || input[0] === "V") ? input.slice(1) : input;
}

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+(?=[0-9])/, "");
  return stripped;
}

// Parses the "major.minor.patch" section. Missing trailing components
// default to 0; leading zeros in each component are dropped.
function parseCore(coreRaw: string): FormatResult {
  if (coreRaw.length === 0) {
    return fail("missing version number");
  }

  const parts = coreRaw.split(".");
  if (parts.length > 3) {
    return fail(`too many version number components (expected up to 3, got ${parts.length})`);
  }

  const normalized: string[] = [];
  for (const part of parts) {
    if (!DIGITS_ONLY.test(part)) {
      return fail(`invalid version number component "${part}"`);
    }
    normalized.push(stripLeadingZeros(part));
  }
  while (normalized.length < 3) {
    normalized.push("0");
  }

  return ok(normalized.join("."));
}

// Parses dot-separated prerelease identifiers. Purely numeric identifiers
// have their leading zeros stripped; alphanumeric identifiers are kept as-is.
function parsePrerelease(raw: string): FormatResult {
  const identifiers = raw.split(".");
  const normalized: string[] = [];

  for (const identifier of identifiers) {
    if (identifier.length === 0) {
      return fail("empty prerelease identifier");
    }
    if (!IDENTIFIER_CHARS.test(identifier)) {
      return fail(`invalid prerelease identifier "${identifier}"`);
    }
    if (DIGITS_ONLY.test(identifier)) {
      normalized.push(stripLeadingZeros(identifier));
    } else {
      normalized.push(identifier);
    }
  }

  return ok(normalized.join("."));
}

// Parses dot-separated build metadata identifiers. Kept verbatim aside from
// character validation; build metadata carries no numeric meaning in semver.
function parseBuild(raw: string): FormatResult {
  const identifiers = raw.split(".");

  for (const identifier of identifiers) {
    if (identifier.length === 0) {
      return fail("empty build metadata identifier");
    }
    if (!IDENTIFIER_CHARS.test(identifier)) {
      return fail(`invalid build metadata identifier "${identifier}"`);
    }
  }

  return ok(identifiers.join("."));
}

/**
 * Normalizes a version string into canonical semver form.
 *
 * Accepts: surrounding whitespace, an optional leading "v"/"V", missing
 * minor/patch numbers, and leading zeros anywhere they appear. Rejects
 * anything that can't be turned into a well-formed semver string, with a
 * human-readable reason.
 */
export function formatVersion(input: string): FormatResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return fail("empty input");
  }

  const withoutPrefix = stripLeadingVPrefix(trimmed);
  const [withoutBuild, buildRaw] = splitOnFirst(withoutPrefix, "+");
  const [coreRaw, prereleaseRaw] = splitOnFirst(withoutBuild, "-");

  const core = parseCore(coreRaw);
  if (!core.ok) {
    return core;
  }

  let result = core.value;

  if (prereleaseRaw !== null) {
    const prerelease = parsePrerelease(prereleaseRaw);
    if (!prerelease.ok) {
      return prerelease;
    }
    result += `-${prerelease.value}`;
  }

  if (buildRaw !== null) {
    const build = parseBuild(buildRaw);
    if (!build.ok) {
      return build;
    }
    result += `+${build.value}`;
  }

  return ok(result);
}

/** Applies formatVersion to a batch of inputs, preserving order. */
export function formatVersions(inputs: readonly string[]): FormatResult[] {
  return inputs.map(formatVersion);
}

const CANONICAL_SEMVER =
  /^([0-9]|[1-9][0-9]*)\.([0-9]|[1-9][0-9]*)\.([0-9]|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[] | null;
}

// compareVersions only accepts strings already in canonical form (i.e. the
// output of formatVersion), so an invalid input here is a caller bug, not
// bad user input — it throws rather than returning a FormatResult.
function parseCanonical(version: string): ParsedVersion {
  const match = CANONICAL_SEMVER.exec(version);
  if (match === null) {
    throw new Error(`not a canonical semver string: "${version}"`);
  }
  const prerelease = match[4];
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: prerelease === undefined ? null : prerelease.split("."),
  };
}

function compareIdentifiers(a: string, b: string): number {
  const aIsNumeric = DIGITS_ONLY.test(a);
  const bIsNumeric = DIGITS_ONLY.test(b);

  if (aIsNumeric && bIsNumeric) {
    const aNum = Number(a);
    const bNum = Number(b);
    return aNum === bNum ? 0 : aNum < bNum ? -1 : 1;
  }
  if (aIsNumeric !== bIsNumeric) {
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    return aIsNumeric ? -1 : 1;
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

function comparePrerelease(a: readonly string[] | null, b: readonly string[] | null): number {
  if (a === null && b === null) {
    return 0;
  }
  // A version with a prerelease has lower precedence than the same version without one.
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }

  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (i >= a.length) {
      return -1;
    }
    if (i >= b.length) {
      return 1;
    }
    const cmp = compareIdentifiers(a[i]!, b[i]!);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return 0;
}

/**
 * Compares two canonical semver strings for sort order, following semver
 * precedence rules (build metadata is ignored, as the spec requires).
 * Returns a negative number, zero, or a positive number, suitable for
 * passing directly to Array.prototype.sort.
 *
 * Both inputs must already be canonical semver, e.g. the output of
 * formatVersion — this does not accept the messy input formatVersion does.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseCanonical(a);
  const right = parseCanonical(b);

  if (left.major !== right.major) {
    return left.major < right.major ? -1 : 1;
  }
  if (left.minor !== right.minor) {
    return left.minor < right.minor ? -1 : 1;
  }
  if (left.patch !== right.patch) {
    return left.patch < right.patch ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}
