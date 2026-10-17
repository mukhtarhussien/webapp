import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'api_client.dart';

const navy = Color(0xFF14233D);
const navyDeep = Color(0xFF0D192E);
const gold = Color(0xFFB39154);
const goldLight = Color(0xFFE5CC9C);
const pageBg = Color(0xFFF2F4F8);
const ink = Color(0xFF171B25);
const muted = Color(0xFF687386);
const line = Color(0xFFDDE3EC);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  final api = ApiClient();
  await api.restoreToken();
  runApp(SchoolPulseApp(api: api));
}

class SchoolPulseApp extends StatelessWidget {
  const SchoolPulseApp({super.key, required this.api});
  final ApiClient api;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'School Pulse',
        debugShowCheckedModeBanner: false,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        theme: ThemeData(
          useMaterial3: true,
          scaffoldBackgroundColor: pageBg,
          colorScheme: ColorScheme.fromSeed(seedColor: navy, primary: navy, secondary: gold),
          fontFamily: 'Arial',
          appBarTheme: const AppBarTheme(backgroundColor: pageBg, foregroundColor: ink, elevation: 0, centerTitle: false),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: const Color(0xFFF6F7FA),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
            labelStyle: const TextStyle(color: muted, fontSize: 12),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: line)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: gold, width: 1.5)),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: line)),
          ),
        ),
        home: api.token == null ? LoginScreen(api: api) : AppShell(api: api),
      );
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  String _role = 'student';
  bool _hidePassword = true;
  bool _busy = false;
  String? _error;
  String? _challenge;
  bool _googleVerified = false;
  String? _verifiedEmail;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  String _roleTitle(String role) => switch (role) {
        'teacher' => 'المدرس',
        'admin' => 'الإدارة',
        _ => 'الطالب',
      };

  Future<void> _login() async {
    if (_identifier.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'أدخل بيانات الحساب وكلمة المرور.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final data = await widget.api.login(identifier: _identifier.text, password: _password.text, role: _role);
      if (data['requiresTwoFactor'] == true) {
        final challenge = data['challengeToken']?.toString();
        if (challenge == null || challenge.isEmpty) throw ApiFailure('لم يصل رمز التحقق من الخادم.');
        setState(() => _challenge = challenge);
        return;
      }
      final token = data['accessToken']?.toString();
      if (token == null || token.isEmpty) throw ApiFailure('لم يصل رمز الجلسة من الخادم.');
      await widget.api.saveToken(token);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => AppShell(api: widget.api)));
    } on ApiFailure catch (e) {
      setState(() => _error = _friendlyError(e));
    } catch (_) {
      setState(() => _error = 'حدث خطأ غير متوقع أثناء تسجيل الدخول.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _friendlyError(ApiFailure e) {
    switch (e.code) {
      case 'invalid_credentials': return 'البريد أو اسم المستخدم أو الهاتف أو كلمة المرور غير صحيحة.';
      case 'role_mismatch': return 'هذا الحساب لا يطابق نوع الدخول المختار.';
      case 'rate_limited': return 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.';
      case 'login_locked': return 'تم إيقاف محاولات الدخول مؤقتًا. حاول لاحقًا.';
      case 'registration_required': return 'هذا الحساب غير مسجل في المدرسة بعد.';
      default: return e.message;
    }
  }

  Future<void> _verifyCode() async {
    if (_code.text.trim().isEmpty || _challenge == null) {
      setState(() => _error = 'أدخل رمز التحقق.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final data = await widget.api.finishTwoFactor(challengeToken: _challenge!, code: _code.text);
      final token = data['accessToken']?.toString();
      if (token == null || token.isEmpty) throw ApiFailure('لم يصل رمز الجلسة من الخادم.');
      await widget.api.saveToken(token);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => AppShell(api: widget.api)));
    } on ApiFailure catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _googleLogin() async {
    setState(() { _busy = true; _error = null; });
    try {
      const serverClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
      final google = GoogleSignIn(serverClientId: serverClientId.isEmpty ? null : serverClientId);
      final account = await google.signIn();
      if (account == null) return;
      final auth = await account.authentication;
      final idToken = auth.idToken;
      if (idToken == null || idToken.isEmpty) {
        setState(() => _error = 'لم يصل Google ID token. أضف إعداد OAuth الخاص بتطبيق Android حسب ملف README.');
        return;
      }
      final data = await widget.api.googleLogin(idToken: idToken, role: _role);
      if (data['requiresPassword'] == true && data['googleVerified'] == true) {
        setState(() {
          _googleVerified = true;
          _verifiedEmail = data['email']?.toString();
          if (_verifiedEmail != null) _identifier.text = _verifiedEmail!;
          _error = 'تم التحقق من Google. أكمل كلمة المرور لحساب الإدارة.';
        });
        return;
      }
      final token = data['accessToken']?.toString();
      if (token == null || token.isEmpty) throw ApiFailure('لم يصل رمز الجلسة من الخادم.');
      await widget.api.saveToken(token);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => AppShell(api: widget.api)));
    } on ApiFailure catch (e) {
      setState(() => _error = _friendlyError(e));
    } catch (_) {
      setState(() => _error = 'تعذر إكمال تسجيل Google. تحقق من إعداد OAuth للتطبيق.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: LayoutBuilder(builder: (context, box) {
            final wide = box.maxWidth >= 820;
            final hero = _LoginHero(compact: !wide);
            final form = _loginForm();
            final card = Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(wide ? 26 : 18), border: Border.all(color: line), boxShadow: const [BoxShadow(color: Color(0x14222834), blurRadius: 28, offset: Offset(0, 10))]),
              child: wide ? IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(flex: 9, child: hero), Expanded(flex: 10, child: form)])) : Column(children: [hero, form]),
            );
            return SingleChildScrollView(
              padding: EdgeInsets.all(wide ? 28 : 10),
              child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1240), child: card)),
            );
          }),
        ),
      );

  Widget _loginForm() => Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('أهلًا بعودتك', style: TextStyle(color: gold, fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          const Text('تسجيل الدخول', style: TextStyle(color: ink, fontSize: 29, fontWeight: FontWeight.w800, letterSpacing: -.6)),
          const SizedBox(height: 7),
          const Text('اختر طريقة الدخول المناسبة لحسابك.', style: TextStyle(color: muted, fontSize: 12, height: 1.8)),
          const SizedBox(height: 21),
          if (_error != null) _ErrorBox(message: _error!),
          if (_challenge != null) ..._twoFactorFields() else ...[
            const Text('اختر نوع الحساب', style: TextStyle(color: ink, fontSize: 12, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            _roleChoices(),
            const SizedBox(height: 20),
            if (_googleVerified && _verifiedEmail != null) Container(padding: const EdgeInsets.all(11), margin: const EdgeInsets.only(bottom: 12), decoration: BoxDecoration(color: const Color(0xFFF6F7FA), borderRadius: BorderRadius.circular(10)), child: Text('تم التحقق من Google: $_verifiedEmail', textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 11, color: gold))),
            TextField(controller: _identifier, textDirection: TextDirection.auto, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'البريد الإلكتروني أو اسم المستخدم أو رقم الهاتف', prefixIcon: Icon(Icons.person_outline_rounded))),
            const SizedBox(height: 12),
            TextField(controller: _password, obscureText: _hidePassword, onSubmitted: (_) => _login(), autofillHints: const [AutofillHints.password], decoration: InputDecoration(labelText: 'كلمة المرور', prefixIcon: const Icon(Icons.lock_outline_rounded), suffixIcon: IconButton(onPressed: () => setState(() => _hidePassword = !_hidePassword), icon: Icon(_hidePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined))),),
            const SizedBox(height: 14),
            SizedBox(height: 50, child: FilledButton.icon(onPressed: _busy ? null : _login, icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.lock_outline_rounded, size: 17), label: Text(_busy ? 'جارٍ تسجيل الدخول...' : 'دخول ${_roleTitle(_role)}'), style: FilledButton.styleFrom(backgroundColor: navy, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)))),
            const SizedBox(height: 10),
            SizedBox(height: 49, child: OutlinedButton.icon(onPressed: _busy ? null : _googleLogin, icon: const Icon(Icons.g_mobiledata_rounded, size: 27, color: Color(0xFF4285F4)), label: const Text('المتابعة باستخدام Google'), style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFF2F3745), side: const BorderSide(color: line), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)))),
            const SizedBox(height: 17),
          ],
          Row(mainAxisAlignment: MainAxisAlignment.center, children: const [Icon(Icons.verified_user_outlined, size: 15, color: gold), SizedBox(width: 7), Flexible(child: Text('لا تشارك كلمة المرور أو رموز التحقق مع أي شخص.', textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 10, height: 1.8)))]),
          const SizedBox(height: 13),
          const Center(child: Text('قواعد المنصة  ·  بوابتك التعليمية', style: TextStyle(color: Color(0xFF8993A3), fontSize: 10))),
        ]),
      );

  List<Widget> _twoFactorFields() => [
        const Text('تحقق بخطوتين', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: ink)),
        const SizedBox(height: 8),
        const Text('أدخل رمز التحقق الذي أعدّته إدارة الحساب.', style: TextStyle(color: muted, fontSize: 12, height: 1.8)),
        const SizedBox(height: 14),
        TextField(controller: _code, keyboardType: TextInputType.number, autofocus: true, inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)], onSubmitted: (_) => _verifyCode(), decoration: const InputDecoration(labelText: 'رمز التحقق', prefixIcon: Icon(Icons.verified_user_outlined))),
        const SizedBox(height: 14),
        SizedBox(height: 49, child: FilledButton(onPressed: _busy ? null : _verifyCode, style: FilledButton.styleFrom(backgroundColor: navy, foregroundColor: Colors.white), child: Text(_busy ? 'جارٍ التحقق...' : 'تحقق وتابع'))),
        TextButton(onPressed: _busy ? null : () => setState(() { _challenge = null; _code.clear(); _error = null; }), child: const Text('العودة إلى تسجيل الدخول')),
      ];

  Widget _roleChoices() {
    const roles = [
      ('student', 'الدخول كطالب', 'الدرجات والواجبات', Icons.person_outline_rounded),
      ('teacher', 'الدخول كمدرس', 'المتابعة والتواصل', Icons.school_outlined),
      ('admin', 'دخول الإدارة', 'إدارة المنصة', Icons.admin_panel_settings_outlined),
    ];
    return Column(children: roles.map((r) {
      final selected = _role == r.$1;
      return Padding(padding: const EdgeInsets.only(bottom: 8), child: InkWell(
        onTap: _busy ? null : () => setState(() { _role = r.$1; _error = null; _googleVerified = false; }),
        borderRadius: BorderRadius.circular(13),
        child: AnimatedContainer(duration: const Duration(milliseconds: 160), padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10), decoration: BoxDecoration(color: selected ? const Color(0xFFF3F5F8) : Colors.white, borderRadius: BorderRadius.circular(13), border: Border.all(color: selected ? gold : line, width: selected ? 1.5 : 1)), child: Row(children: [
          Container(width: 40, height: 40, decoration: BoxDecoration(color: const Color(0xFFEEE7D7), borderRadius: BorderRadius.circular(11)), child: Icon(r.$4, color: navy, size: 20)),
          const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(r.$2, style: const TextStyle(color: ink, fontSize: 12, fontWeight: FontWeight.w800)), const SizedBox(height: 3), Text(r.$3, style: const TextStyle(color: muted, fontSize: 10))])),
          Icon(selected ? Icons.check_circle_rounded : Icons.arrow_back_rounded, color: selected ? gold : const Color(0xFF8993A3), size: 18),
        ])),
      ));
    }).toList());
  }
}

class _LoginHero extends StatelessWidget {
  const _LoginHero({required this.compact});
  final bool compact;
  @override
  Widget build(BuildContext context) => Container(
        constraints: BoxConstraints(minHeight: compact ? 220 : 650),
        padding: EdgeInsets.all(compact ? 23 : 38),
        decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topRight, end: Alignment.bottomLeft, colors: [navyDeep, Color(0xFF142643), Color(0xFF203451)])),
        child: Stack(children: [
          Positioned(right: -95, top: 100, child: IgnorePointer(child: Container(width: 250, height: 250, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: const Color(0x22D7BC85)))))),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Container(width: 46, height: 46, decoration: BoxDecoration(color: Colors.white.withOpacity(.08), border: Border.all(color: Colors.white.withOpacity(.18)), borderRadius: BorderRadius.circular(14)), child: const Icon(Icons.school_rounded, color: goldLight, size: 26)), const SizedBox(width: 12), const Text('SCHOOL PULSE', style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.4))]),
            SizedBox(height: compact ? 23 : 55),
            const Text('مساحة تعليمية واحدة', style: TextStyle(color: goldLight, fontSize: 12, fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            Text('تعلّمك،\nإنجازاتك،\nومستقبلك.', style: TextStyle(color: const Color(0xFFFBFAF6), fontSize: compact ? 30 : 42, height: 1.45, fontWeight: FontWeight.w800, letterSpacing: -.5)),
            const SizedBox(height: 14),
            const Text('تابع دراستك وتواصل مع مدرستك من خلال بوابة واحدة، صُممت لتجعل الوصول إلى معلوماتك أسهل وأكثر وضوحًا.', style: TextStyle(color: Color(0xB8FFFFFF), fontSize: 12, height: 2)),
            if (!compact) ...[
              const SizedBox(height: 28),
              const _HeroFeature(icon: Icons.menu_book_rounded, title: 'كل شيء دراسي بمكان واحد', subtitle: 'الدرجات والواجبات والإعلانات'),
              const SizedBox(height: 15),
              const _HeroFeature(icon: Icons.shield_outlined, title: 'وصول آمن لحسابك', subtitle: 'تسجيل دخول وحماية للحساب'),
              const SizedBox(height: 35),
            ] else const SizedBox(height: 18),
            const Text('بوابتك التعليمية للطلاب والمدرسين', style: TextStyle(color: Color(0x99FFFFFF), fontSize: 10)),
          ]),
        ]),
      );
}

class _HeroFeature extends StatelessWidget {
  const _HeroFeature({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Row(children: [Container(width: 42, height: 42, decoration: BoxDecoration(color: Colors.white.withOpacity(.06), border: Border.all(color: Colors.white.withOpacity(.13)), borderRadius: BorderRadius.circular(13)), child: Icon(icon, color: goldLight, size: 19)), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(color: Color(0xFFF6F4EC), fontSize: 12, fontWeight: FontWeight.w800)), const SizedBox(height: 4), Text(subtitle, style: const TextStyle(color: Color(0x99FFFFFF), fontSize: 10))]))]);
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Container(margin: const EdgeInsets.only(bottom: 14), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFFF1F0), border: Border.all(color: const Color(0xFFF1C7C3)), borderRadius: BorderRadius.circular(12)), child: Text(message, style: const TextStyle(color: Color(0xFF9D3028), fontSize: 12, height: 1.7)));
}

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.api});
  final ApiClient api;
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 2;
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _dashboard = {};
  static const _titles = ['درجاتي', 'التقويم', 'الرئيسية', 'الإشعارات', 'المجتمع'];
  static const _icons = [Icons.school_outlined, Icons.calendar_month_outlined, Icons.home_rounded, Icons.notifications_none_rounded, Icons.forum_outlined];

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _dashboard = await widget.api.dashboard();
    } on ApiFailure catch (e) {
      _error = e.message;
      if (e.code == 'unauthorized') {
        await widget.api.clearToken();
        if (mounted) Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => LoginScreen(api: widget.api)), (_) => false);
      }
    } catch (_) { _error = 'تعذر تحميل بيانات المدرسة.'; }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _logout() async {
    await widget.api.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => LoginScreen(api: widget.api)), (_) => false);
  }

  List<dynamic> _listFrom(List<String> keys) {
    for (final key in keys) {
      final value = _dashboard[key];
      if (value is List) return value;
    }
    final nested = _dashboard['dashboard'];
    if (nested is Map<String, dynamic>) {
      for (final key in keys) { if (nested[key] is List) return nested[key] as List; }
    }
    return const [];
  }

  String _first(Map item, List<String> keys, [String fallback = '']) {
    for (final key in keys) { final v = item[key]; if (v != null && '$v'.trim().isNotEmpty) return '$v'; }
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _dataPage('درجاتي', Icons.school_outlined, _listFrom(['grades']), 'لا توجد درجات منشورة حاليًا.', (m) => _first(m, ['subjectAr', 'subject', 'titleAr', 'assessment'], 'المادة'), (m) => '${_first(m, ['score'], '—')} / ${_first(m, ['maxScore'], '—')}'),
      _dataPage('التقويم', Icons.calendar_month_outlined, _listFrom(['calendarEvents', 'events']), 'لا توجد أحداث في التقويم حاليًا.', (m) => _first(m, ['titleAr', 'title', 'nameAr'], 'موعد مدرسي'), (m) => _first(m, ['startsAt', 'date', 'startDate'], '')),
      _homePage(),
      _dataPage('الإشعارات', Icons.notifications_none_rounded, _listFrom(['notifications']), 'ما عندك إشعارات جديدة.', (m) => _first(m, ['titleAr', 'title'], 'إشعار مدرسي'), (m) => _first(m, ['bodyAr', 'body', 'message'], '')),
      _dataPage('المجتمع', Icons.forum_outlined, _listFrom(['community', 'posts']), 'ماكو منشورات متاحة حاليًا.', (m) => _first(m, ['titleAr', 'title', 'content', 'bodyAr'], 'منشور مدرسي'), (m) => _first(m, ['bodyAr', 'body', 'content'], '')),
    ];
    return Directionality(textDirection: TextDirection.rtl, child: Scaffold(
      appBar: AppBar(title: Row(children: [Container(width: 34, height: 34, decoration: BoxDecoration(color: navy, borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.school_rounded, color: goldLight, size: 20)), const SizedBox(width: 10), const Text('School Pulse', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17))]), actions: [IconButton(tooltip: 'تحديث', onPressed: _load, icon: const Icon(Icons.refresh_rounded)), IconButton(tooltip: 'تسجيل الخروج', onPressed: _logout, icon: const Icon(Icons.logout_rounded))]),
      body: _loading ? const Center(child: CircularProgressIndicator(color: gold)) : _error != null ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.cloud_off_outlined, size: 44, color: muted), const SizedBox(height: 12), Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: muted)), const SizedBox(height: 14), FilledButton.icon(onPressed: _load, icon: const Icon(Icons.refresh), label: const Text('إعادة المحاولة'))]))) : RefreshIndicator(color: gold, onRefresh: _load, child: IndexedStack(index: _index, children: pages)),
      bottomNavigationBar: NavigationBar(selectedIndex: _index, onDestinationSelected: (i) => setState(() => _index = i), backgroundColor: Colors.white, indicatorColor: const Color(0xFFEDE5D6), destinations: List.generate(_titles.length, (i) => NavigationDestination(icon: Icon(_icons[i]), selectedIcon: Icon(_icons[i], color: navy), label: _titles[i])),),
    ));
  }

  Widget _homePage() {
    final user = _dashboard['user'] is Map ? Map<String, dynamic>.from(_dashboard['user'] as Map) : <String, dynamic>{};
    final name = _first(user, ['fullName', 'name', 'nameAr'], 'أهلًا بك');
    final grades = _listFrom(['grades']);
    final assignments = _listFrom(['assignments']);
    final announcements = _listFrom(['announcements']);
    final notifications = _listFrom(['notifications']);
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 26), children: [
      Container(padding: const EdgeInsets.all(22), decoration: BoxDecoration(borderRadius: BorderRadius.circular(22), gradient: const LinearGradient(colors: [navyDeep, Color(0xFF203451)], begin: Alignment.topRight, end: Alignment.bottomLeft)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('بوابتك التعليمية', style: TextStyle(color: goldLight, fontSize: 11, fontWeight: FontWeight.w800)), const SizedBox(height: 9), Text(name, style: const TextStyle(color: Colors.white, fontSize: 23, fontWeight: FontWeight.w800)), const SizedBox(height: 7), const Text('كل ما تحتاجه لمتابعة دراستك في مكان واحد.', style: TextStyle(color: Color(0xCCFFFFFF), height: 1.8, fontSize: 12)), const SizedBox(height: 19), Row(children: [_stat('الدرجات', grades.length, Icons.auto_graph_rounded), const SizedBox(width: 10), _stat('الواجبات', assignments.length, Icons.assignment_outlined), const SizedBox(width: 10), _stat('الإشعارات', notifications.length, Icons.notifications_none_rounded)])]),
      const SizedBox(height: 22),
      const _SectionTitle('إعلانات المدرسة'),
      if (announcements.isEmpty) const _EmptyCard(text: 'لا توجد إعلانات منشورة حاليًا.') else ...announcements.take(4).map((a) { final m = a is Map ? Map<String, dynamic>.from(a) : <String, dynamic>{}; return _InfoCard(icon: Icons.campaign_outlined, title: _first(m, ['titleAr', 'title', 'titleEn'], 'إعلان'), subtitle: _first(m, ['bodyAr', 'body', 'bodyEn'], ''), trailing: ''); }),
      const SizedBox(height: 12),
      const _SectionTitle('الواجبات'),
      if (assignments.isEmpty) const _EmptyCard(text: 'ماكو واجبات ظاهرة حاليًا.') else ...assignments.take(4).map((a) { final m = a is Map ? Map<String, dynamic>.from(a) : <String, dynamic>{}; return _InfoCard(icon: Icons.assignment_outlined, title: _first(m, ['titleAr', 'title', 'titleEn'], 'واجب'), subtitle: _first(m, ['subjectAr', 'subject', 'descriptionAr'], ''), trailing: _first(m, ['dueAt', 'dueDate'], '')); }),
    ]);
  }

  Widget _stat(String label, int value, IconData icon) => Expanded(child: Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12), decoration: BoxDecoration(color: Colors.white.withOpacity(.08), border: Border.all(color: Colors.white.withOpacity(.12)), borderRadius: BorderRadius.circular(13)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, color: goldLight, size: 18), const SizedBox(height: 9), Text('$value', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)), Text(label, style: const TextStyle(color: Color(0xCCFFFFFF), fontSize: 10))])));

  Widget _dataPage(String title, IconData icon, List<dynamic> items, String empty, String Function(Map<String, dynamic>) headline, String Function(Map<String, dynamic>) subtitle) => ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Row(children: [Container(width: 44, height: 44, decoration: BoxDecoration(color: const Color(0xFFEDE5D6), borderRadius: BorderRadius.circular(14)), child: Icon(icon, color: navy)), const SizedBox(width: 12), Text(title, style: const TextStyle(color: ink, fontSize: 22, fontWeight: FontWeight.w800))]),
        const SizedBox(height: 17),
        if (items.isEmpty) _EmptyCard(text: empty) else ...items.map((item) { final m = item is Map ? Map<String, dynamic>.from(item) : <String, dynamic>{}; return _InfoCard(icon: icon, title: headline(m), subtitle: subtitle(m), trailing: ''); }),
      ]);
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(bottom: 11), child: Text(text, style: const TextStyle(color: ink, fontSize: 15, fontWeight: FontWeight.w800)));
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.icon, required this.title, required this.subtitle, required this.trailing});
  final IconData icon;
  final String title;
  final String subtitle;
  final String trailing;
  @override
  Widget build(BuildContext context) => Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: Colors.white, border: Border.all(color: line), borderRadius: BorderRadius.circular(15)), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Container(width: 38, height: 38, decoration: BoxDecoration(color: const Color(0xFFF0E9DC), borderRadius: BorderRadius.circular(11)), child: Icon(icon, color: navy, size: 19)), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(color: ink, fontWeight: FontWeight.w800, fontSize: 12)), if (subtitle.isNotEmpty) ...[const SizedBox(height: 6), Text(subtitle, style: const TextStyle(color: muted, height: 1.8, fontSize: 11))]])), if (trailing.isNotEmpty) Text(trailing, style: const TextStyle(color: gold, fontSize: 10, fontWeight: FontWeight.w700))]));
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 24), decoration: BoxDecoration(color: Colors.white, border: Border.all(color: line), borderRadius: BorderRadius.circular(15)), child: Column(children: [const Icon(Icons.inbox_outlined, color: gold, size: 30), const SizedBox(height: 9), Text(text, textAlign: TextAlign.center, style: const TextStyle(color: muted, fontSize: 12, height: 1.8))]));
}
