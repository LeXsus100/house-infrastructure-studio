# Publishing and updating on GitHub

Every publication action in this procedure is manual. You decide when the
source and each installer release are ready, then run the explicit push commands
yourself. Publishing a reviewed GitHub Release triggers the documentation
deployment for that exact release snapshot.

## 1. Install the publication tools once

1. Install [Git for Windows](https://git-scm.com/download/win).
2. Create or sign in to a GitHub account.
3. Choose one authentication method:
   - GitHub Desktop;
   - GitHub CLI (`gh auth login`); or
   - Git Credential Manager through a normal HTTPS `git push`.
4. For local Windows installer builds, install the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/): Visual Studio Build Tools with **Desktop development with C++**, WebView2, and the stable MSVC Rust toolchain.
5. Confirm the tools in PowerShell:

```powershell
git --version
node --version
npm --version
rustc --version
cargo --version
```

Node.js 24 or newer is required because the local API uses Node's built-in SQLite module.

## 2. Understand the public/private boundary

The following are deliberately local and ignored:

- `.data/`, SQLite/WAL/SHM files, project JSON mirrors, blueprints, photographs, exports, and backups;
- `local-assets/` (including `local-assets/branding/house_icon.png`), plus any legacy `public/house_icon.png` or root `house_icon.png`;
- `AGENTS.md`, which contains local assistant maintenance instructions;
- `start-house-studio.bat`;
- `.env`, `.env.*` except `.env.example`, `.npmrc`, package tarballs, and `*.local` overrides;
- generated web/Tauri/Rust output, installers, Node sidecar binaries, and signing material.

`package.json` and `package-lock.json` are source dependency manifests and should
be committed. The lockfile gives GitHub and CI a reproducible dependency graph.

The committed icon is `public/app-icon.svg` plus the neutral Windows icon set
under `src-tauri/icons/`. A private in-app icon selected in **Settings →
Administration** lives in local browser/Tauri storage, separate from SQLite and
project backups.

## 3. Run the pre-publication checks

From the project root:

```powershell
npm install
npm test
npm run build
npm run docs:build
npm audit
```

Search the publishable source for personal paths and obsolete private-icon references:

```powershell
rg -n -i --hidden --glob '!node_modules/**' --glob '!dist/**' --glob '!.data/**' "[A-Z]:\\\\Users\\\\|[A-Z]:\\\\Luigi\\\\|api[_-]?key|client[_-]?secret|BEGIN (RSA|OPENSSH|EC|PRIVATE)" .
rg -n --glob '!node_modules/**' --glob '!dist/**' "house_icon\\.png" src server shared public index.html
```

The second command should return no committed application/documentation reference. Review every hit from the first command; documentation can mention generic security terms, but real paths or values must be removed.

## 4. Create the empty GitHub repository

1. In GitHub choose **New repository**.
2. Enter the repository name, for example `house-infrastructure-studio`.
3. Starting as **Private** is safest. You can switch it to Public after inspecting the first uploaded tree. If you choose Public immediately, complete every check below first.
4. Leave the GitHub README, `.gitignore`, and license options empty so the local repository provides the first commit.
5. Create the repository and copy its HTTPS URL.

GitHub's official procedure is [Adding locally hosted code to GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

## 5. Create and inspect the first local commit

Configure the author identity if Git has not been configured on this computer:

```powershell
git config --global user.name "YOUR DISPLAY NAME"
git config --global user.email "YOUR GITHUB NOREPLY EMAIL"
```

Initialize the repository and verify the sensitive paths. Each `git check-ignore` command should print the matching `.gitignore` rule:

```powershell
git init -b main
git check-ignore --no-index -v .data/casa.sqlite
git check-ignore --no-index -v AGENTS.md
git check-ignore --no-index -v local-assets/branding/house_icon.png
git check-ignore --no-index -v public/house_icon.png
git check-ignore --no-index -v start-house-studio.bat
git check-ignore --no-index -v .env
git check-ignore --no-index -v .npmrc
```

Then stage locally without pushing:

```powershell
git add -A
git status --short
git diff --cached --check
git diff --cached --name-only
```

The staged list should contain the public source tree. Keep `AGENTS.md`, `.data`,
`local-assets`, databases, `house_icon.png`, `start-house-studio.bat`, `.env`,
`.npmrc`, project backups, blueprints, photographs, `node_modules`, `dist`,
`src-tauri/target`, installers, and signing keys in their ignored local
locations.

Run these final negative checks; all should produce no path:

```powershell
git ls-files AGENTS.md .data local-assets public/house_icon.png house_icon.png start-house-studio.bat .env .npmrc
git ls-files -ci --exclude-standard
```

Inspect actual staged content as needed:

```powershell
git diff --cached
```

Only after the staged tree is correct:

```powershell
git commit -m "Initial public source release"
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git remote -v
git push -u origin main
```

The final command is the first publication point. Run it after completing the
staged-content review.

## 6. Configure the GitHub repository after the first push

1. Enable GitHub secret scanning and push protection where available.
2. Enable private vulnerability reporting so `SECURITY.md` has a working private channel.
3. Keep Actions enabled. `.github/workflows/ci.yml` tests and builds source after a manual push. Configure **Settings → Pages → Build and deployment → Source** to **GitHub Actions** when the documentation site is ready to be published.
4. Review repository visibility, description, topics, and default branch.
5. Confirm that the root `LICENSE`, package metadata, README, and documentation
   continue to identify the project under the MIT License.

## 7. Publish normal source updates manually

Work locally and test as usual. Before every update:

```powershell
git status --short
git diff
npm test
npm run build
npm run docs:build
npm audit
```

Prefer staging the exact files you intend to publish:

```powershell
git add src server shared tests documentation public font config src-tauri scripts .github README.md index.html vite.config.ts package.json package-lock.json .gitignore
git status --short
git diff --cached --check
git diff --cached --name-only
git ls-files -ci --exclude-standard
git diff --cached
```

Then create and manually push the update:

```powershell
git commit -m "Describe the completed change"
git push origin main
```

Pushing `main` runs the source checks. Installer releases begin with the
version-tag procedure in section 9.

## 8. Build and test the Windows installer locally

The selected distribution is a current-user NSIS installer with standard-user
installation privileges. It includes the WebView2 bootstrapper and a Node.js 24
runtime for offline operation of the private loopback API.

```powershell
npm run desktop:build
```

The installer is created under:

```text
src-tauri/target/release/bundle/nsis/
```

Install it on a test Windows account or machine, create a disposable project,
restart the app, and verify persistence before making a GitHub Release. The
installer and generated sidecar stay in ignored build-output locations.

The current installer is unsigned, so Windows SmartScreen may warn users. A
SHA-256 checksum proves that a download matches the release asset; Authenticode
signing establishes publisher identity and contributes to SmartScreen
reputation.

For public Authenticode signing, use a certificate or managed signing service whose chain is trusted by Windows, timestamp every signature, and sign every release with the same validated publisher identity. A self-signed certificate is suitable only for controlled test machines. [Microsoft's current code-signing guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options) recommends Artifact Signing for eligible non-Store publishers, while qualifying open-source projects can also apply to [SignPath Foundation](https://signpath.org/). Even a correctly signed new app can show an initial SmartScreen warning while reputation develops; Microsoft Store distribution is the most reliable path to avoiding download warnings. Once a provider is selected, follow [Tauri's Windows signing configuration](https://v2.tauri.app/distribute/sign/windows/). Never commit a certificate, private key, token, or signing profile. Store CI signing credentials only as protected GitHub secrets and add the signing step only after choosing a provider.

## 9. Create a GitHub Release manually

Assign every published release a new semantic version and tag. Example for
`0.2.0`:

```powershell
npm run version:set -- 0.2.0
npm test
npm run build
npm run desktop:build
git diff
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "Release 0.2.0"
git push origin main
git tag -a v0.2.0 -m "House Infrastructure Studio 0.2.0"
git push origin v0.2.0
```

The tag push starts `.github/workflows/release.yml`. The official Tauri action
builds the Windows installer and creates a **draft** GitHub Release. The draft
stays private until a maintainer publishes it; documentation deployment starts
from the published release event.

1. Open **GitHub → Actions** and wait for **Build Windows installer draft** to finish.
2. Open **GitHub → Releases → Drafts**.
3. Verify the tag, generated notes, file name, installer size, downloaded installer, and matching `.sha256` asset.
4. Verify the download before running it ([open-source verification script](https://github.com/LeXsus100/house-infrastructure-studio/blob/main/scripts/verify-release.ps1)):

```powershell
powershell -File .\verify-release.ps1 -InstallerPath '.\downloaded-installer.exe'
```

5. Test that downloaded installer.
6. Click **Publish release** only when satisfied. Publication starts `.github/workflows/docs.yml`, which builds the same tagged documentation snapshot and deploys it to GitHub Pages.

Keep a draft unpublished when its build or test needs correction. Fix the source
and use a new patch version/tag such as `v0.2.1`; unique release tags keep
downloads auditable.

## 10. If sensitive information is staged or published

Before a push, unstage it and add an ignore rule:

```powershell
git restore --staged PATH-TO-PRIVATE-FILE
```

If it is already in the latest unpublished local commit, remove it from tracking
and amend:

```powershell
git rm --cached PATH-TO-PRIVATE-FILE
git commit --amend --no-edit
```

If a credential or private file reached GitHub, deleting it in a later commit is not enough because Git history retains it. Immediately revoke/rotate credentials and follow GitHub's [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) procedure.
