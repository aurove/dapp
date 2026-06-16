# Wallet Auth Architecture

This dApp uses wallet signatures as the source of identity and Supabase as the durable data store for users, challenges, and sessions.

## Why this structure

- A connected wallet is not proof of ownership, so the user signs a server-issued nonce before the app creates a session.
- The app session is an opaque, HTTP-only cookie backed by a server-side session row, which allows revocation, renewal, and logout without exposing secrets to the browser.
- Supabase stores persistent identity data and session state, while the browser never receives the service-role key.
- The browser can still use a public Supabase client for read-only operations, the server can use a server client for authenticated work, and privileged writes stay on the server with the service-role client.

## Flow

1. The wallet connects through RainbowKit/wagmi.
2. The app asks the server for a nonce and challenge message.
3. The wallet signs the message.
4. The server verifies the signature, upserts the user record, marks the challenge as used, and creates an opaque session.
5. The app stores only authenticated state in React context and rehydrates it from the session endpoint.

## Supabase tables

- `users` stores the wallet identity and profile metadata.
- `auth_challenges` stores nonce challenges with expiration and usage tracking.
- `auth_sessions` stores opaque session hashes so the server can revoke and rotate sessions safely.

## Operational notes

- Session cookies are HTTP-only, `SameSite=Lax`, and `Secure` in production.
- Login rotates stale sessions and revokes older sessions for the same wallet.
- Logout revokes the current session server-side and clears the cookie.
- The Supabase CLI runs the schema locally with `supabase start`, `supabase stop`, and `supabase db reset`.
