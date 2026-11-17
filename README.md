# Walkin Photographer Studio

A Node.js 24 and Express backend with React dashboards for superadmins and data collectors. The React client lives in `client/` and calls the same JSON API available to other clients. One server serves both dashboards and owns authentication, authorization, validation, storage and invitation delivery.

## Run locally

From the project directory, run `npm ci`, then `npm run dev`. Open http://127.0.0.1:3000. The development server restarts when backend code changes. Use `npm start` for a regular run. The application binds to loopback. Local accounts, storefronts, photos and Android sessions persist in `data/walkin.sqlite`.

## Dashboard access

Copy `.env.example` to `.env`, set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of 12–256 characters, and restart. Sign in at the root URL. The first startup with these values creates the superadmin. Once created, its password hash is stored in the database and the bootstrap password can be removed from the environment.

The superadmin dashboard shows process CPU, memory, uptime, API timings, database latency, server errors and the last 200 API requests. Metrics, logs and eight-hour sessions are per server process and reset on restart. Each collector sees their own storefronts. Pre-login records remain available through the authenticated superadmin catalog API.

Set `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`, relay credentials and `APP_URL`. Use port 587 with STARTTLS or 465 with implicit TLS. For remote collectors, point `APP_URL` at a reachable HTTPS reverse proxy forwarding to the loopback server. From the superadmin dashboard enter the collector's email address and select **Email login details**. The email includes their login ID and a random temporary password valid for 24 hours. The collector must replace it on first login. Failed or expired invitations can be retried. A sent status means the SMTP relay accepted the message.

## Database and media storage

Each installation uses one database. The `users` table holds the three identities used by the application. The database enforces a unique normalized email and restricts the role to `admin` (superadmin), `collector` or `consumer` (Android). All three use the same UUID primary key format.

| Table | Data and relationships |
| --- | --- |
| `users` | UUID `id`, unique `email`, optional `display_name`, role, scrypt password hash, disabled flag, temporary-password flag, invitation expiry and delivery state, and UTC creation time. |
| `mobile_sessions` | Hashed bearer token, expiry, and `user_id` referencing `users.id`. Deleting the user cascades to their sessions. |
| `market_roads` | Market, area type, road name, direction landmarks and length. |
| `storefronts` | Store metadata, JPEG/PNG bytes, archive state, optional road placement and `owner_user_id` referencing `users.id`. The `owner` field retains the original staff email for display. Demo records can be unassigned. |

On startup, the identity migration copies legacy accounts, links existing session tokens and storefront owners to their user IDs, and commits the changes together. Existing password hashes and invitation state are preserved. Legacy creation times remain null because the earlier schema did not record them. Unmatched historical owner emails remain visible to superadmins. Creating a storefront and its image is one SQL insert. Lists select metadata only. Switching from local SQLite to PostgreSQL requires transferring the data separately.

- **Amazon RDS PostgreSQL** — set `DATABASE_URL` to an existing reachable database. Its user needs permission to create and use the storefronts table. For verified TLS, use the RDS CA bundle and the database hostname. Set `NODE_EXTRA_CA_CERTS` in your shell before starting Node if you need to add the CA bundle to Node's trust store.
- **Existing photos** — on startup the backend copies images from the previous `DATA_DIR/photos` directory or configured private S3/R2 bucket into the same database, including archived rows. Keep the original source and read credentials available until migration completes. If a source image is missing, restore it and restart. Completed copies are skipped and original objects are retained.

## Android API

### Straight-road market map

Each road belongs to a business market or shopping area. Its named start is 0 metres. Stand at the start and face the end landmark to identify left and right. Measure each façade from its **first edge** encountered while walking forward and record its width along the road. A storefront at offset 4 m with an 8 m frontage occupies metres 4–12. Offsets are shared by both sides, so opposite shops can overlap longitudinally and gaps can represent passages. For reverse travel, swap sides and use `length_m - offsetM - frontageM` as the new offset. Keep shop signage readable when changing direction.

In the collector form, choose **Map placement → Add a road** or select an existing road. Enter the side, offset and frontage and attach a front-facing JPEG or PNG. Transparent PNGs can be used for isolated façades. Existing catalog records have no inferred placement. Edit one to place it on a road or replace its façade.

| Endpoint | Purpose |
| --- | --- |
| Staff `GET /api/roads`, `POST /api/roads` | List or create roads. Creation takes `market`, `area_type` (`business_market` or `shopping_area`), `name`, `start_label`, `end_label` and `length_m`. |
| Staff `POST /api/storefronts`, `PUT /api/storefronts/:id` | Send the usual storefront data plus `"placement":{"roadId":"…","side":"left","offsetM":4,"frontageM":8}`. Omit placement on edit to preserve it, or send null to unmap. The façade must fit inside the road. |
| Android `GET /api/mobile/roads` | Discover road IDs, market names, endpoints and lengths using the consumer bearer token. |
| Android `GET /api/mobile/roads/:roadId/map` | Returns `road`, `left` and `right`. Each side is ordered by offset, then storefront ID. Each item includes `storefrontId`, `name`, `landmark`, `offsetM`, `frontageM` and `facadeUrl`. Fetch images with the same bearer token. A null image URL reserves space for an unphotographed shop. |

The fictional **Demo Arcade Market** dataset is in `datasets/demo-market/road.json` with four original schematic PNG façades. Run `npm run seed:market` to load it into the configured database. Repeated runs retain existing demo records. Fetch `/api/mobile/roads/demo-arcade-lane/map` to test the Android layout.

Point the Android client at the same backend as the dashboards. In the standard Android emulator, use `http://10.0.2.2:3000` for a local debug build with cleartext development traffic enabled. For devices in production, use your deployed HTTPS API origin. The app only needs the API address and its consumer session.

| Method | Path | Request or response |
| --- | --- | --- |
| POST | `/api/mobile/register` | JSON email and password (12–256 characters), plus optional `displayName` (1–120 characters). Returns the new user ID and email with HTTP 201. |
| POST | `/api/mobile/login` | JSON email and password. Returns `accessToken` and ISO `expiresAt` (30 days). |
| GET | `/api/mobile/me` | Returns the signed-in consumer's ID, email, display name, role and temporary-password flag. Requires a bearer token. |
| GET | `/api/mobile/storefronts?q=market&limit=50&offset=0` | Returns `items` and `nextOffset` (null at the end). Limit 1–100. |
| GET | `/api/mobile/storefronts/:id` | Returns id, name, market, landmark, created and photoUrl. |
| GET | `/api/mobile/storefronts/:id/photo` | Returns JPEG or PNG bytes. Resolve the relative `photoUrl` against the API origin. A null URL means the record has no image. |
| POST | `/api/mobile/logout` | Send an empty JSON object to revoke the bearer token. |

Send `Authorization: Bearer <accessToken>` on catalog, image and logout requests, including requests made by the Android image loader. Sign in again on HTTP 401. Dashboard writes appear immediately for all signed-in consumers. Archiving removes a storefront and its photo from the feed and detail endpoints. Staff accounts use the separate dashboard login.

## API

Start a session with `POST /api/login`. Send the returned `walkin_sid` cookie on subsequent requests. Send JSON bodies with `Content-Type: application/json`. A temporary credential grants access to identity, password replacement and logout until the user chooses a password. The server enforces account roles and record ownership for every catalog operation.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/health` | Public readiness check, 200 when the database responds or 503 otherwise |
| POST | `/api/login` | Accepts `email` and `password`, sets a session cookie and returns email, role and temporary-password state |
| GET | `/api/me` | Current identity and temporary-password state |
| POST | `/api/password` | Replaces the temporary password using `password` and rotates the session cookie, 204 |
| POST | `/api/logout` | Send an empty JSON object to end the session, 204 |
| GET | `/api/admin/overview` | Superadmin runtime metrics, database latency, storage settings and recent requests |
| GET | `/api/admin/logs` | Latest 200 requests, newest first. Add `?errors=true` for HTTP 4xx and 5xx |
| GET | `/api/admin/collectors` | Collector email, access and invitation state |
| POST | `/api/admin/collectors` | Send `email` to invite a collector or retry a failed or expired invitation, 201 after SMTP acceptance |
| PATCH | `/api/admin/collectors/:email` | URL-encode the email and send `{"disabled":true}` or `{"disabled":false}`. Disabling revokes active sessions |
| GET | `/api/storefronts` | Visible records ordered newest first. Use `?q=market` to search names, markets and landmarks |
| POST | `/api/storefronts` | Creates a record and returns it with HTTP 201 |
| GET | `/api/storefronts/:id` | One visible storefront |
| PUT | `/api/storefronts/:id` | Replace name, market and landmark. The photo and owner are preserved |
| DELETE | `/api/storefronts/:id` | Archive the record, 204. The database retains the row and underlying photo. Catalog and photo routes hide archived records |
| GET | `/api/storefronts/:id/photo` | JPEG or PNG image, or HTTP 404 |

Send JSON with required `name` and `market` fields, optional `landmark`, and optional `photo` containing base64 image bytes (5 MiB maximum before encoding).

Run `npm run build` to compile the React client and `npm test` for the API integration test with isolated SQLite and a local SMTP receiver. Both `npm start` and `npm run dev` compile the client automatically. Development mode watches backend and JSX files. Refresh the browser after a JSX edit.
