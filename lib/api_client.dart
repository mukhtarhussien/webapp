import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiFailure implements Exception {
  final String message;
  final String code;
  ApiFailure(this.message, [this.code = 'request_failed']);
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  static const String baseUrl = String.fromEnvironment(
    'SCHOOL_PULSE_BASE_URL',
    defaultValue: 'https://al-fidae.vercel.app',
  );
  static const _storage = FlutterSecureStorage();
  final http.Client _client;
  String? _token;

  String? get token => _token;

  Future<void> restoreToken() async {
    _token = await _storage.read(key: 'school_pulse_access_token');
  }

  Future<void> saveToken(String token) async {
    _token = token;
    await _storage.write(key: 'school_pulse_access_token', value: token);
  }

  Future<void> clearToken() async {
    _token = null;
    await _storage.delete(key: 'school_pulse_access_token');
  }

  Future<Map<String, dynamic>> get(String path) async => _request('GET', path);
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async =>
      _request('POST', path, body: body);

  Future<Map<String, dynamic>> _request(String method, String path,
      {Map<String, dynamic>? body}) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (_token != null) headers['Authorization'] = 'Bearer $_token';

    late http.Response response;
    try {
      final request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      final streamed = await _client.send(request).timeout(const Duration(seconds: 20));
      response = await http.Response.fromStream(streamed);
    } catch (_) {
      throw ApiFailure('تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا.', 'network_error');
    }

    Map<String, dynamic> decoded;
    try {
      decoded = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw ApiFailure('وصل رد غير مفهوم من الخادم.', 'invalid_response');
    }

    if (response.statusCode < 200 || response.statusCode >= 300 || decoded['ok'] == false) {
      final error = decoded['error'];
      final code = error is Map ? '${error['code'] ?? 'request_failed'}' : 'request_failed';
      final message = error is Map ? '${error['message'] ?? 'تعذر إكمال الطلب.'}' : 'تعذر إكمال الطلب.';
      throw ApiFailure(message, code);
    }
    final data = decoded['data'];
    return data is Map<String, dynamic> ? data : <String, dynamic>{};
  }

  Future<Map<String, dynamic>> login({required String identifier, required String password, required String role}) =>
      post('/api/v1/auth/login', {'identifier': identifier.trim(), 'password': password, 'role': role});

  Future<Map<String, dynamic>> finishTwoFactor({required String challengeToken, required String code}) =>
      post('/api/v1/auth/two-factor', {'challengeToken': challengeToken, 'code': code.trim()});

  Future<Map<String, dynamic>> googleLogin({required String idToken, required String role}) =>
      post('/api/v1/auth/google', {'idToken': idToken, 'role': role});

  Future<Map<String, dynamic>> dashboard() => get('/api/v1/dashboard');

  Future<void> logout() async {
    try {
      await post('/api/v1/auth/logout', {});
    } catch (_) {
      // Local credentials must still be removed if the network is unavailable.
    }
    await clearToken();
  }
}
