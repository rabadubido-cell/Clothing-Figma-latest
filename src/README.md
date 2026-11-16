# Source organization

The source tree is divided by runtime responsibility so files are easy to locate and debug.

- `app/(frontend)`: Next.js public pages, route handlers, route-private UI, and frontend-only helpers.
  - `_components`: non-routable React components grouped by feature.
  - `_lib`: frontend-only layout and rendering helpers.
  - `api`: thin HTTP boundaries; business and data behavior belongs in `backend` or `domain`.
- `app/(payload)`: Payload-managed admin and API routes. Do not edit this directory directly.
- `backend`: server-only authentication, access control, Payload-backed queries, and mutation handlers.
- `collections`: Payload collection schemas. These stay at the framework-standard location.
- `domain`: framework-independent business rules and their colocated tests.
- `lib`: shared framework utilities that are intentionally used across boundaries.

## Dependency direction

`app` may import from `backend`, `domain`, and `lib`. `backend` may import from `domain` and `lib`.
`domain` must remain independent of Next.js, React, and Payload runtime APIs.
