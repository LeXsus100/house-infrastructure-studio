# Contributing

Thank you for helping improve House Infrastructure Studio.

## Before opening an issue

- Search existing issues first.
- Never attach a real floor plan, house photograph, project database, backup, address, credential, or signing key.
- Reproduce problems with a minimal synthetic project whenever possible.
- Security problems belong in GitHub private vulnerability reporting, as described in the [security policy](security.md).

## Development workflow

1. Fork the repository and create a focused branch.
2. Install Node.js 24 or newer and run `npm install`.
3. Start the local editor with `npm run dev`.
4. Keep all network listeners on `127.0.0.1` and preserve offline operation.
5. Store geometry as integer millimetres and keep project mutations immutable.
6. Add or update tests for affected critical logic.
7. Run `npm test`, `npm run build`, `npm run docs:build`, and `npm audit`.
8. Open a pull request describing the behavior, validation performed, and relevant constraints.

Windows desktop changes should also be checked with `npm run desktop:build` when the Tauri prerequisites are available.

## Generative AI contributions

AI-assisted contributions are welcome, but the contributor remains responsible for understanding, reviewing, testing, licensing, and accurately describing the submitted work. Do not submit generated code that contains private data or incompatible third-party material.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
