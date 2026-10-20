# School Platform

بوابة مدرسية ثنائية اللغة (العربية والإنكليزية) مبنية باستخدام Next.js وReact وPostgreSQL عبر Neon. تتضمن صفحات الحسابات والدرجات والواجبات والحضور والإعلانات والرسائل والإشعارات ولوحة الإدارة.

## المتطلبات

- Node.js 20.9 أو أحدث وnpm.
- قاعدة PostgreSQL متوافقة مع Neon.

## التشغيل محليًا

1. ثبّت الاعتماديات وأنشئ ملف الإعدادات المحلي:

   ```bash
   npm ci
   cp .env.example .env.local
   ```

2. عدّل `.env.local`، وأدخل على الأقل:

   - `DATABASE_URL`: رابط اتصال PostgreSQL.
   - `SESSION_SECRET`: سر عشوائي للجلسات؛ أنشئه مثلًا عبر `openssl rand -hex 32`.
   - `ADMIN_EMAIL` و`ADMIN_PASSWORD`: بيانات حساب المدير الأول.
   - `NEXT_PUBLIC_APP_URL`: عنوان الموقع، مثل `http://localhost:3000` محليًا.

3. جهّز متغيرات قاعدة البيانات والمدير في الطرفية، ثم طبّق المخطط وأنشئ حساب المدير:

   ```bash
   export DATABASE_URL='رابط قاعدة البيانات'
   export ADMIN_EMAIL='admin@example.com'
   export ADMIN_PASSWORD='كلمة مرور قوية'
   npm run db:push
   node scripts/bootstrap-admin.mjs
   ```

   على قاعدة موجودة، ملف `migrations/20261009_user_preferences.sql` يضيف عمود تفضيلات المستخدم عند الحاجة. شغّل SQL يدويًا على قاعدة البيانات القائمة إذا كان العمود غير موجود؛ الاستعلام آمن عند تكرار تشغيله.

4. ابدأ خادم التطوير:

   ```bash
   npm run dev
   ```

   ثم افتح `http://localhost:3000`.

## إعدادات اختيارية

- **تسجيل الدخول عبر Google:** اضبط `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` و`GOOGLE_REDIRECT_URI` في مزوّد OAuth وفي البيئة.
- **رفع تطبيق Android:** اضبط `AWS_ENDPOINT_URL_S3` و`AWS_ACCESS_KEY_ID` و`AWS_SECRET_ACCESS_KEY` و`AWS_REGION` لمخزن S3-compatible، ثم أعد النشر. يلزم أن تسمح سياسة CORS في المخزن بطلبات الرفع من نطاق الموقع.
- لا تضع أسرارًا في Git أو في متغيرات `NEXT_PUBLIC_*`.

## CSS

يعمل `app/globals.css` كمدخل مرتب فقط؛ تفاصيل التنسيق موزعة في `app/styles/` حسب الوظيفة: `shell.css` للتنقل والإطار، `dashboard.css` و`dashboard-overrides.css` و`calendar.css` للصفحات الرئيسية، `themes.css` للسمات، وملفات مستقلة للحساب والرسائل والإشعارات والإدارة والدخول والرفع والحركة. ترتيب الاستيراد في `globals.css` مقصود للحفاظ على الـcascade. قواعد `mobile-360.css` تضبط الواجهة للشاشات الضيقة، ومنها عرض 360 CSS px. أضف تنسيقات كل صفحة إلى ملف وظيفتها، واستخدم `shared-overrides.css` فقط للقواعد المشتركة.

## أوامر المشروع

- `npm run dev` — خادم التطوير.
- `npm run build` — بناء الإنتاج.
- `npm run start` — تشغيل نسخة الإنتاج بعد البناء.
- `npm run db:push` — مزامنة مخطط Drizzle مع قاعدة البيانات.
- `npm run admin:bootstrap` — إنشاء/تحديث حساب المدير؛ يتطلب `DATABASE_URL` و`ADMIN_EMAIL` و`ADMIN_PASSWORD` في البيئة.

## Flutter API

The native Flutter app can use the versioned JSON API at `/api/v1`. See [docs/flutter-api.md](docs/flutter-api.md) for login, dashboard, asset, and profile-photo request formats.

## تطبيق Flutter

يوجد مشروع التطبيق الأصلي في `flutter_app/`. تعليمات إنشاء ملفات Android/iOS وتشغيل التطبيق موجودة في [flutter_app/README.md](flutter_app/README.md).
