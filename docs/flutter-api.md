# Flutter API

The Flutter app uses the school's Next.js site as its backend and asset host. It does not render the site in a WebView.

- Production base URL: `https://al-fidae.vercel.app`
- API version: `v1`
- Content type: `application/json; charset=utf-8`
- Authenticated requests: `Authorization: Bearer <accessToken>`
- All success and error responses use JSON and private responses are marked `Cache-Control: no-store`.

Use `GET /api/v1` for endpoint discovery and `GET /api/v1/bootstrap` to load the current site identity, separate Flutter app settings, Arabic/English names, logo URL, locale direction, theme colors, and API URLs.

## Response format

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": { "apiVersion": "1" }
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "unauthorized",
    "message": "..."
  },
  "meta": { "apiVersion": "1" }
}
```

## Login

`POST /api/v1/auth/login`

```json
{ "identifier": "student@example.com", "password": "...", "role": "student" }
```

A regular successful login returns `data.accessToken`, `data.expiresAt`, and a safe user profile. The optional `role` field (`student`, `teacher`, or `admin`) ensures the selected sign-in path matches the account. Store the access token in platform secure storage. Never put it in logs or a URL. Send it as a Bearer token on private API and image requests.

If an administrator has two-factor authentication enabled, login returns `data.requiresTwoFactor: true` and a short-lived `data.challengeToken`. Complete the challenge with:

`POST /api/v1/auth/two-factor`

```json
{ "challengeToken": "...", "code": "123456" }
```

The response contains the regular access token. The challenge expires after ten minutes and allows at most eight code attempts. The Flutter website container exchanges a valid API bearer token for the normal website session by loading `GET /api/auth/flutter-session` with the token in its Authorization header; that route sets the regular HttpOnly website cookie and redirects to `/`.

Google sign-in sends the Google ID token obtained by Flutter (not the Google access token), plus the selected student/teacher role:

`POST /api/v1/auth/google`

```json
{ "idToken": "...", "role": "teacher" }
```

The server verifies the token with Google and checks the audience against `GOOGLE_CLIENT_ID` and `GOOGLE_MOBILE_CLIENT_IDS`. Student and teacher accounts receive an API session. For an administrator, the endpoint only verifies the Google identity and returns `requiresPassword`; the app must then submit the linked email or phone with the password to `/api/v1/auth/login`, followed by TOTP when enabled. It never creates an administrator account through Google sign-in. An unregistered Google account receives `registration_required`; the app then submits a student or teacher registration request through the same route below. Set `GOOGLE_MOBILE_CLIENT_IDS` to the comma-separated OAuth client IDs that appear as the ID token audience; the existing `GOOGLE_CLIENT_ID` is also accepted.

`GET /api/v1/register` returns available classes and subjects. Student registration accepts a verified Google ID token or a password with at least one of phone, username, or email. Teacher registration requires a verified Google ID token and a teaching subject. Both registration forms collect full name, birth date, and mobile number, and stay pending until the school administration approves the request.

## Current account and dashboard

- `GET /api/v1/me` returns the current safe account and token expiry.
- `GET /api/v1/dashboard` returns the profile, class, published grades, assignments and submission status, announcements, calendar events, notifications, attendance, summary counts, and asset endpoint URLs.
- `GET /api/v1/content` returns published rules, campus locations, and assessment progress comparisons.
- `GET /api/v1/community` returns published posts, comments, vote totals, and the current user's vote. `POST /api/v1/community` creates posts, comments, and votes.
- `GET /api/v1/messages` returns available contacts, conversations, requests, and blocked users. `POST /api/v1/messages` sends or responds to requests and blocks/unblocks accounts.
- `PATCH /api/v1/me` updates the current account name, phone number, and appearance preferences. `PATCH /api/v1/notifications` stores the notification mute preference.
- Admin accounts can use `GET` and `POST /api/v1/admin` for dashboard data and school management actions.
- `POST /api/v1/auth/logout` revokes the current access token.

Only the signed-in user's own grades, attendance, assignment submissions, and notifications are returned. The API never serializes password hashes, recovery-code hashes, or encrypted two-factor secrets.

## Assets

`GET /api/v1/assets` returns the school's public logo, the signed-in user's photo, and files the user owns or that are marked visible to everyone / their role. File URLs are absolute URLs from the school's site or approved HTTPS object storage. Photo URLs require the same Bearer token.

Example Flutter requests:

```dart
final response = await http.get(
  Uri.parse('$baseUrl/api/v1/dashboard'),
  headers: {'Authorization': 'Bearer $accessToken'},
);
final json = jsonDecode(response.body) as Map<String, dynamic>;
final dashboard = json['data'] as Map<String, dynamic>;
```

To render a protected profile photo with `Image.network`:

```dart
Image.network(
  photoUrl,
  headers: {'Authorization': 'Bearer $accessToken'},
  errorBuilder: (_, __, ___) => const CircleAvatar(child: Icon(Icons.person)),
)
```

The profile image can also be changed with `POST /api/profile-photo` as multipart form data with a `photo` field containing a JPEG (maximum 2 MiB), or removed with `DELETE /api/profile-photo`. Send the Bearer header for both requests.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1` | No | API discovery |
| GET | `/api/v1/bootstrap` | No | Site branding, locale, logo and endpoint URLs |
| POST | `/api/v1/auth/login` | No | Email, username or phone plus password login |
| POST | `/api/v1/auth/google` | No | Sign in with a verified Google ID token |
| GET | `/api/auth/flutter-session` | Bearer | Exchange an API token for the website session cookie in the Flutter WebView |
| GET / POST | `/api/v1/register` | No | Load classes/subjects and submit student or teacher registration requests |
| POST | `/api/v1/auth/two-factor` | Challenge token | Finish administrator 2FA |
| GET | `/api/v1/me` | Bearer | Current safe account |
| GET | `/api/v1/dashboard` | Bearer | App home data |
| GET | `/api/v1/assets` | Bearer | Available image and file assets |
| GET | `/api/v1/content` | Bearer | Progress comparisons, rules and campus map |
| GET / POST | `/api/v1/community` | Bearer | Read and manage posts, comments and votes |
| GET / POST | `/api/v1/messages` | Bearer | Contacts, private conversations and contact requests |
| PATCH | `/api/v1/me` | Bearer | Edit account profile and appearance |
| PATCH | `/api/v1/notifications` | Bearer | Save notification preference |
| GET / POST | `/api/v1/admin` | Admin Bearer | Admin summary and site management actions |
| POST | `/api/v1/auth/logout` | Bearer | Revoke access token |
| POST / DELETE | `/api/profile-photo` | Bearer | Set or remove the current user's photo |
| GET | `/api/profile-photo/{userId}` | Bearer | Fetch an active user's photo |

Native Flutter requests do not need browser CORS configuration. Keep the production site URL on HTTPS.
