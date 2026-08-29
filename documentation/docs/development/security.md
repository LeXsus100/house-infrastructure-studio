# Security policy

## Supported version

Security fixes are applied to the latest release and the current `main` branch.

## Reporting a vulnerability

Keep vulnerability details, private floor plans, project backups, databases,
blueprints, photographs, credentials, and signing keys out of public issues.

Use the repository's **Security → Report a vulnerability** form (GitHub private
vulnerability reporting). Include the affected version, local reproduction
steps, impact, and the smallest synthetic test project that demonstrates the
issue. When the private-reporting form is unavailable, ask the repository owner
for another private channel and keep sensitive details for that channel.

The supported runtime uses a loopback-only API and local project storage.
Reports about a separately configured deployment or public listener enter scope
when the repository itself introduced that behavior.
