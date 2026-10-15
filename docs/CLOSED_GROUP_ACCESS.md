# Preserve a closed group's access in a shared project

An application can share every row among a fixed set of approved people without granting access to every account in the Supabase project. Use the approved accounts' verified Supabase user UUIDs as membership. New accounts created by another app receive no membership automatically.

## First verify the existing application's identity

The application must send a signed-in Supabase user's access token with its database requests, or use a trusted private backend that verifies membership itself. Opening a website without a login does not establish either condition. Inspect its connection before changing policies: a frontend that currently uses the public key alone would lose access when restricted to signed-in members.

If that frontend has no identity, add sign-in with access limited to approved accounts first. Keep the approved UUID list server/database controlled. Do not treat a shared PIN checked only in browser code, a hidden URL, request Origin, or editable user metadata as membership. Never put a service-role/secret key in the frontend to bypass the restriction.

Do not disable signups globally to close just one app: Supabase Auth settings affect every application in this project, including BrickMade's guest creation. App-specific database membership controls access independently.

## Optional database guard

The [manual template](../supabase/manual/closed-group-access.sql) is intentionally outside `migrations/`. It is never applied automatically by BrickMade or CI to a hosted project.

After verifying the app uses real Supabase sessions:

1. Identify only its approved users in Supabase Authentication → Users. Do not include all accounts from the shared project. No user IDs or keys need to be posted in chat.
2. In a private copy of the template, set `target_schema`, `target_table` and `approved_user_ids`, for example `array['your-first-approved-uuid', 'your-second-approved-uuid']::uuid[]`. Use actual UUIDs, not email addresses or these placeholders.
3. Run that configured SQL in the correct project's SQL Editor. Empty lists, missing accounts, guest identities, missing tables and an already installed guard abort the transaction. Existing row data and grants are preserved.
4. Verify each approved user can read and modify shared records. An unapproved signed-in user, a guest account and a caller without a user session must have no read/write access. Check the original app as well as direct API requests before enabling BrickMade guests.

The policy is **restrictive**: existing permissive policies must also satisfy its membership condition. It applies to all normal API roles and checks reads, inserts, updates and deletes. It keeps existing sharing among approved users; it does not add permissions or change other tables. PostgreSQL owners and service-role processes can bypass RLS and must remain trusted. Future membership edits require a deliberate database-administrator change; running the template again will not silently replace the list.

## Verification

The database workflow runs the actual template against a simulated existing shared app on real PostgreSQL. It verifies shared read/write access for two approved accounts, denied access for another app's account and guest/unauthenticated callers, protection against client-side membership edits, preserved maintenance access, and atomic failure for invalid configuration.
