# WaiBrain DSH Runtime Demo Status

Status: complete

Current stage: verified

Completed: the standalone UI runs one main Session plus configurable branch Sessions through the real DSH Host. Each Session keeps its own System Prompt, model, and reasoning effort; branch reports return through the main Session, and dynamic attachment joins the next turn.

Verification: focused package tests, UI unit tests, type checks, production build, relevant document gates, keyless real-Host browser E2E, combined dev-server smoke, and live DeepSeek Flash/Pro one-turn smokes pass. The repository-wide `doc-sync` reaches 27 relevant or independent gates but its Host build prerequisite remains blocked by the root `tsdown` entry-resolution issue tracked outside this demo.
