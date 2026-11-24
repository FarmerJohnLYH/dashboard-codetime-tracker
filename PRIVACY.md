# Privacy and publication review

The extension stores file paths, project aliases, task identifiers and activity statistics locally in VS Code globalStorage. It does not upload them or store source code text.

Public source files contain synthetic test paths and generic example issue keys. Runtime records, local profiles, screenshots, credentials and dependency directories are excluded from this repository. Public GitHub attribution and the extension publisher name are intentionally retained.

Before publication, source and lockfiles were inspected for hard-coded credentials, private keys, authenticated URLs, personal identifiers and organization-specific examples. Organization-specific sample labels and issue prefixes were replaced. Pattern scanning and manual review cannot guarantee detection of every possible secret.
