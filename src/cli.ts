#!/usr/bin/env node
// Formats version strings given as arguments, or one per line on stdin if
// no arguments are given.
//
//   semver-tidy v1.2 01.2.3-Beta.01
//   echo v1.2 | semver-tidy
//
// Each successfully formatted version is printed to stdout on its own
// line; each rejection is printed to stderr as "error: <input>: <reason>"
// and does not stop the rest of the batch. The process exits with status 1
// if any input was rejected.
//
// `process` is typed minimally here (no @types/node) to match the rest of
// the project's zero-dependency policy.

import { formatVersion } from "./format.js";

declare const process: {
  readonly argv: readonly string[];
  readonly stdin: {
    setEncoding(encoding: string): void;
    on(event: "data", listener: (chunk: string) => void): void;
    on(event: "end", listener: () => void): void;
  };
  readonly stdout: { write(chunk: string): void };
  readonly stderr: { write(chunk: string): void };
  exitCode: number;
};

// Formats a single input, writing the result to stdout or stderr.
// Returns whether it succeeded, so callers can track a batch's exit status.
function formatOne(input: string): boolean {
  const result = formatVersion(input);
  if (result.ok) {
    process.stdout.write(`${result.value}\n`);
    return true;
  }
  process.stderr.write(`error: ${input}: ${result.reason}\n`);
  return false;
}

function runOnArgs(args: readonly string[]): void {
  let allOk = true;
  for (const arg of args) {
    if (!formatOne(arg)) {
      allOk = false;
    }
  }
  if (!allOk) {
    process.exitCode = 1;
  }
}

function runOnStdin(): void {
  let buffer = "";
  let allOk = true;

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0 && !formatOne(line)) {
        allOk = false;
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });
  process.stdin.on("end", () => {
    const line = buffer.trim();
    if (line.length > 0 && !formatOne(line)) {
      allOk = false;
    }
    if (!allOk) {
      process.exitCode = 1;
    }
  });
}

const args = process.argv.slice(2);
if (args.length > 0) {
  runOnArgs(args);
} else {
  runOnStdin();
}
