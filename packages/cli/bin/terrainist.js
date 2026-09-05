#!/usr/bin/env node
// The `terrainist` command. This file exists at install time so npm links the
// bin before the package is built; the command itself lives in dist/.
import("../dist/index.js").then(
  (cli) =>
    cli.main(process.argv.slice(2)).then(
      (code) => {
        process.exitCode = code;
      },
      (error) => {
        console.error(`terrainist: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof Error && error.cause instanceof Error) console.error(`  caused by: ${error.cause.message}`);
        process.exitCode = 1;
      },
    ),
  (error) => {
    console.error(`terrainist: ${error instanceof Error ? error.message : String(error)}`);
    console.error("  is the package built? run `npm run build` at the repo root");
    process.exitCode = 1;
  },
);
