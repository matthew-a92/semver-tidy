# semver-tidy

Version strings that come from users, config files, git tags, or old
package.json files are rarely clean semver. You get things like `v1.2`,
`1.02.3-Beta.01`, ` 1.0.0 `, or `01.2.3+Build.007`. Most of that is
recoverable — it's just noise around a real version number — but every
consumer of the value ends up writing its own ad hoc cleanup.

`semver-tidy` is that cleanup, done once, as a pure function: give it a
messy string, get back canonical semver or a specific reason it can't be
fixed.

## What it normalizes

- Surrounding whitespace: `" 1.2.3 "` → `1.2.3`
- A leading `v`/`V`: `v1.2.3` → `1.2.3`
- Missing minor/patch numbers: `1` → `1.0.0`, `1.2` → `1.2.0`
- Leading zeros in numbers: `01.02.03` → `1.2.3`
- Leading zeros in numeric prerelease identifiers: `1.2.3-Beta.01` → `1.2.3-Beta.1`

It intentionally does **not** try to parse ranges (`^1.2.3`, `~1.2.3`),
comparators (`>=1.2.3`), or non-numeric version schemes. If the core
version numbers can't be recovered, `formatVersion` fails with a reason
instead of guessing.

## Usage

```ts
import { formatVersion, formatVersions } from "semver-tidy";

formatVersion("v1.2");
// { ok: true, value: "1.2.0" }

formatVersion(" 01.02.03-Beta.01+Build.007 ");
// { ok: true, value: "1.2.3-Beta.1+Build.007" }

formatVersion("1.2.3.4");
// { ok: false, reason: "too many version number components (expected up to 3, got 4)" }

formatVersions(["v1.0", "not-a-version", "2.0.0"]);
// [
//   { ok: true, value: "1.0.0" },
//   { ok: false, reason: "invalid version number component \"not-a-version\"" },
//   { ok: true, value: "2.0.0" },
// ]

compareVersions("1.2.3-alpha.2", "1.2.3-alpha.10");
// -1 (numeric prerelease identifiers compare numerically, not lexically)
```

`FormatResult` is a plain discriminated union (`{ ok: true, value }` or
`{ ok: false, reason }`), so callers can branch on `.ok` without exceptions
or a parsing library.

`compareVersions` follows semver precedence rules (build metadata is
ignored) and returns a negative number, zero, or a positive number, so it
can be passed directly as an `Array.prototype.sort` comparator. Unlike
`formatVersion`, it expects both inputs to already be canonical — pass it
the output of `formatVersion`, not raw messy strings — and it throws if
either input isn't well-formed semver:

```ts
const versions = ["v2.0", "1.0.0-alpha", "01.0.0"]
  .map(formatVersion)
  .filter((r): r is FormatSuccess => r.ok)
  .map((r) => r.value)
  .sort(compareVersions);
// ["1.0.0-alpha", "1.0.0", "2.0.0"]
```

## CLI

```
semver-tidy v1.2 01.2.3-Beta.01
# 1.2.0
# 1.2.3-Beta.1

echo v1.2 | semver-tidy
# 1.2.0
```

With arguments, each one is formatted and printed on its own line. With no
arguments, it reads stdin, one version per line. Either way, a rejected
version is printed to stderr as `error: <input>: <reason>` instead of
stdout, the rest of the batch still runs, and the process exits with
status 1 if anything was rejected.

## Design

Every exported function is pure: same input always produces the same
output, no I/O, no shared state. That's what makes the normalization rules
easy to pin down with plain input/output test cases, and it keeps the
formatter safe to run on untrusted input — it can reject, but it can't
throw or hang.

## Building

```
npx tsc
```

No runtime dependencies. TypeScript is the only build-time tool.

## Testing

```
npm test
```

Tests are a small self-contained runner in `src/format.test.ts` — no test
framework, just plain functions and thrown errors on mismatch. Running it
builds first, then executes the compiled output with `node`.

## Status

Early skeleton. Core normalization for `major.minor.patch`, prerelease,
and build metadata is implemented and covered by tests, as is
`compareVersions` for sorting the normalized output and a `semver-tidy`
CLI for formatting argv or stdin. See the roadmap in the issue tracker for
what's next (explicit range/comparator handling, publishing to npm).
