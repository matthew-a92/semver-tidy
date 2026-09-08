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
```

`FormatResult` is a plain discriminated union (`{ ok: true, value }` or
`{ ok: false, reason }`), so callers can branch on `.ok` without exceptions
or a parsing library.

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
and build metadata is implemented and covered by tests; see the roadmap
in the issue tracker for what's next (a CLI, comparison helpers).
