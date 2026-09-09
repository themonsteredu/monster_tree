# Student yard signs

The forest-front-yard heading is editable text rather than part of a raster image. The default is `나의 아지트`; students may enter Korean, emoji or other plain text, 1–24 Unicode code points after NFC normalization and trimming. Line breaks, control characters and bidi override/isolate controls are not accepted. Text is rendered by React, never HTML injection.

## Ownership and storage

- TREE owns the yard/wardrobe UI and keeps the existing tree, points, avatar and mood data unchanged.
- The old administrator global background setting is now explicitly TV-only (`/tree` and `/tree/tv`). Its images, storage and TV consumer remain intact; `/me` no longer queries or accepts that obsolete personal-yard input. The admin screen explains the split and links to the student forest preview.
- SITE owns `public.garden_social_homes.sign_text`, separate from the student's login/display name and `mood_text`.
- The browser only calls same-origin `/tree/api/yard-sign`. The TREE server verifies the existing `monster_student` cookie and forwards that cookie alone to the configured SITE `/api/plaza/sign`.
- SITE independently verifies the current signed student credential and active TREE membership. The caller cannot choose a target student ID.
- Writes validate browser origin, JSON media type and a bounded body. The fixed upstream destination comes from server configuration, redirects are refused, responses are private/no-store, and upstream errors/headers are not forwarded.
- SITE sign-only saves and room-only saves update disjoint columns, preserving one another. Existing RLS and server-only grants remain in force.

## Preview and verification

`/tree/admin/yard-preview` is administrator-guarded and uses fixture data. Its sign editor changes local component state only; reload restores the fixture. Never use a production student's saved title as a disposable test value.

Deployment order: verify/apply the additive SITE migration, deploy the SITE API, then deploy TREE. Existing releases tolerate the new column. No TREE database migration is required.

UI checks include 320/360px viewports, long Korean/emoji text, keyboard focus, save/cancel, escaped text, and the no-write preview. Desktop emulation does not certify performance on every physical student phone.
