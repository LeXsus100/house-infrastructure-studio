# Maintaining these docs

The complete Zensical project lives in `documentation/`. Product Markdown,
fonts, styles, and the public icon are self-contained under
`documentation/docs/`; the generated site is written to `documentation/site/`
and ignored by Git.

## Local preview on Windows

From the repository root, set up the pinned documentation environment once:

```powershell
npm run docs:setup
```

Start the live preview:

```powershell
npm run docs:serve
```

The preview runs at
[http://127.0.0.1:8000/house-infrastructure-studio/](http://127.0.0.1:8000/house-infrastructure-studio/),
reloads when source files change, and remains local. Stop it with **Ctrl+C**.

## Strict production build

```powershell
npm run docs:build
```

This performs a clean Zensical build with strict validation. It catches missing
pages, invalid internal links, and configuration problems before publication.
The command finishes locally and leaves publication for the release workflow.

## File map

```text
documentation/
├─ README.md                 contributor quick reference
├─ requirements.txt         pinned Zensical build dependency
├─ zensical.toml            site metadata, navigation, theme, repository links
├─ docs/                    authored site content and self-hosted assets
└─ site/                    generated static output (ignored)
```

## Authoring rules

- Add every public page to `project.nav` in `zensical.toml`.
- Use relative `.md` links between source pages; the build converts them to site
  URLs.
- Keep user data, real plans, photographs, addresses, credentials, and private
  branding out of documentation and examples.
- Prefer synthetic examples that explain behavior in a neutral technical
  context and avoid claims of regulatory certification.
- Write direct, formal prose. State the intended behavior first and reserve
  negative wording for a constraint that readers must understand.
- Describe the project on its own terms and explain important boundaries in a
  separate sentence. Avoid defining a feature through a contrasting negation.
- Use commas, semicolons, colons, or parentheses in place of em dashes. The
  authored documentation contains no em dash characters.
- Keep visual examples close to the feature they explain. Reserved media slots
  may be replaced with a PNG, WebP, or animated GIF under `assets/media/`.
- Update capabilities, architecture, database, security, privacy, and release
  instructions when a code change affects their guarantees.
- Run `npm run docs:build` before committing documentation changes.

## Release-aligned publication

`.github/workflows/docs.yml` deploys the exact repository snapshot associated
with a published GitHub Release. Normal pushes and draft releases leave the
site unchanged. A maintainer can also start the workflow manually in GitHub
Actions for an intentional documentation-only publication.

GitHub Pages must be configured once under **Settings → Pages → Build and
deployment → Source → GitHub Actions**. Review the local site before changing
that setting or publishing a release.

The setup follows Zensical's official guides for [creating a
site](https://zensical.org/docs/create-your-site/) and [publishing through
GitHub Actions](https://zensical.org/docs/publish-your-site/).
