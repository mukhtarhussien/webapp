# School Pulse — Flutter

Native Flutter app for the School Pulse portal. It uses the existing School Pulse API; it does **not** embed the website in a WebView.

## What is included

- Arabic RTL login screen inspired by the website's actual `app/login/page.tsx` and `app/styles/login.css` layout.
- Student / teacher / admin role selection.
- Email, username, or phone + password login via `POST /api/v1/auth/login`.
- Admin two-factor challenge via `POST /api/v1/auth/two-factor`.
- Optional Google sign-in via `POST /api/v1/auth/google`.
- Access token stored using platform secure storage.
- Native dashboard with Home, Grades, Calendar, Notifications, and Community tabs, loaded from `GET /api/v1/dashboard`.
- Navy and gold visual identity based on the website's login design and `/api/v1/bootstrap` settings.

## Requirements

- Flutter 3.22+ (Dart 3.3+)
- Android SDK for Android builds

## Run

If the `android/` platform folder is not present in this source archive, generate native platform scaffolding once:

```bash
cd School-Pulse-Flutter
flutter create --platforms=android .
flutter pub get
flutter run
```

Build APK:

```bash
flutter build apk --release
```

The default API URL is `https://al-fidae.vercel.app`. To override it for another deployment:

```bash
flutter run --dart-define=SCHOOL_PULSE_BASE_URL=https://your-school-site.example
```

## Google sign-in setup

Google sign-in requires an OAuth client configuration for the Android application ID and SHA-1/SHA-256 fingerprints. The server must allow the ID token audience in `GOOGLE_MOBILE_CLIENT_IDS` (or the existing `GOOGLE_CLIENT_ID`). Pass the web/server OAuth client ID to Flutter when needed:

```bash
flutter run --dart-define=GOOGLE_SERVER_CLIENT_ID=YOUR_WEB_OAUTH_CLIENT_ID
```

If Google OAuth is not configured, username/password sign-in and two-factor login remain available.

## API contract used

The integration follows `docs/flutter-api.md` from `mukhtarhussien/School-pulse`:

- `GET /api/v1/bootstrap`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/two-factor`
- `POST /api/v1/auth/google`
- `GET /api/v1/dashboard`
- `POST /api/v1/auth/logout`

Tokens are never printed to logs or placed in URLs.

## Note on validation

This archive was assembled in an environment without the Flutter SDK, so it could not be compiled or run here. Run `flutter pub get` and `flutter analyze` after generating the platform scaffolding.
