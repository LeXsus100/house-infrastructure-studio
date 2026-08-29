# House Infrastructure Studio documentation

This folder is the complete source for the project's Zensical site. Product
documentation lives under `docs/`; `zensical.toml` owns navigation, branding,
and site behavior; `site/` is temporary generated output excluded from commits.

## Open the studio and documentation together on Windows

From the repository root, double-click `start-house-studio.bat`, or run:

```powershell
.\start-house-studio.bat
```

The local launcher prepares Zensical on first use, starts both servers, waits
until they are ready, and opens the studio and documentation in the default
browser.

## Preview on Windows

From the repository root, create the isolated documentation environment once:

```powershell
npm run docs:setup
```

Then start the live preview:

```powershell
npm run docs:serve
```

Zensical opens
`http://127.0.0.1:8000/house-infrastructure-studio/` and reloads it when a
Markdown or theme asset changes. Stop the server with **Ctrl+C**.

## Validate a production build

```powershell
npm run docs:build
```

The strict, clean build is written to `documentation/site/`. Publication,
pushes, tags, and releases remain separate maintainer actions.

## Publish later

The repository workflow `.github/workflows/docs.yml` is intentionally aligned
with software releases. It deploys the documentation snapshot belonging to a
GitHub Release only after that release is published. It can also be launched
manually from GitHub Actions when an explicit documentation-only deployment is
wanted. GitHub Pages must first be configured to use **GitHub Actions** as its
source.

See the rendered **Development → Maintaining these docs** and **Development →
Publishing releases** pages for the full maintenance and release procedures.

## Editorial style

- Use direct, formal prose and describe each feature on its own terms.
- Explain important constraints in a separate sentence.
- Use commas, semicolons, colons, or parentheses in place of em dashes.
- Keep reserved visual areas near the feature they illustrate, then replace them
  with project screenshots or GIFs under `docs/assets/media/`.
