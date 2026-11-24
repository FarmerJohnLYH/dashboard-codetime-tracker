# Privacy and publication review

The extension stores file paths, project aliases, task identifiers and activity statistics locally in VS Code globalStorage. It does not upload them or store source code text. Raw JSON export writes only to a location chosen in the save dialog. Exports include full paths, timestamps and project metadata (including legacy task identifiers), but no source text. Keyboard activity is an aggregate count of VS Code selection events marked Keyboard, not raw key logging. No key values, clipboard contents or source text are persisted. Document changes, mouse selection events and saves are counted separately.

Public source files contain synthetic test paths and generic example issue keys. Runtime records, local profiles, screenshots, credentials and dependency directories are excluded from this repository. Public GitHub attribution and the extension publisher name are intentionally retained.

Before publication, source and lockfiles were inspected for hard-coded credentials, private keys, authenticated URLs, personal identifiers and organization-specific examples. Organization-specific sample labels and issue prefixes were replaced. Pattern scanning and manual review cannot guarantee detection of every possible secret.
