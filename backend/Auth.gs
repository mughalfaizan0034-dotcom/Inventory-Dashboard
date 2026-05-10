'use strict';

var Auth = {

  login: function (email, password) {
    try {
      if (!email || !password) return Util.error('Email and password are required');

      email = email.toLowerCase().trim();
      var hash = Auth._hash(password);

      var sql = [
        'SELECT user_id, email, display_name, role, is_active',
        'FROM `' + BQ.tableRef(CONFIG.BQ.TABLES.USERS) + '`',
        "WHERE email = '" + email.replace(/'/g, "''") + "'",
        "  AND password_hash = '" + hash + "'",
        '  AND is_active = TRUE',
        'LIMIT 1'
      ].join('\n');

      var rows = BQ.runQuery(sql);

      if (!rows || rows.length === 0) {
        Debug.log('Auth', 'login', 'warning', { email: email, reason: 'invalid credentials' });
        return Util.error('Invalid email or password');
      }

      var user  = rows[0];
      var token = Auth._createSession(user);

      // Update last_login (best-effort; don't fail login if this fails)
      try {
        BQ.runDML(
          'UPDATE `' + BQ.tableRef(CONFIG.BQ.TABLES.USERS) + '`' +
          " SET last_login = '" + new Date().toISOString() + "'" +
          " WHERE user_id = '" + user.user_id + "'"
        );
      } catch (e) { /* non-fatal */ }

      Debug.logWithUser('Auth', 'login', 'success', { email: email }, email);

      return Util.success({
        token: token,
        user: {
          userId:      user.user_id,
          email:       user.email,
          displayName: user.display_name,
          role:        user.role
        }
      });

    } catch (e) {
      Debug.log('Auth', 'login', 'error', { error: e.message });
      return Util.error('Login failed: ' + e.message);
    }
  },

  logout: function (token) {
    try {
      if (token) CacheService.getScriptCache().remove('sess_' + token);
      return Util.success({ message: 'Logged out' });
    } catch (e) {
      return Util.error('Logout failed: ' + e.message);
    }
  },

  validateSession: function (token) {
    if (!token) return null;
    try {
      var raw = CacheService.getScriptCache().get('sess_' + token);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  requireAuth: function (token) {
    var session = Auth.validateSession(token);
    if (!session) throw new Error('UNAUTHORIZED');
    return session;
  },

  requireRole: function (token, minRole) {
    var session    = Auth.requireAuth(token);
    var userLevel  = CONFIG.AUTH.ROLE_HIERARCHY[session.role]    || 0;
    var reqLevel   = CONFIG.AUTH.ROLE_HIERARCHY[minRole]         || 0;
    if (userLevel < reqLevel) throw new Error('FORBIDDEN');
    return session;
  },

  // One-time bootstrap — run manually in the Apps Script editor to create the super admin.
  // After running, delete or comment out this function for security.
  bootstrapAdminUser: function () {
    var email    = 'mughalfaizan0034@gmail.com';
    var password = '1224a659';
    var hash     = Auth._hash(password);

    // Remove any existing record for this email first (idempotent re-run)
    try {
      BQ.runDML(
        'DELETE FROM `' + BQ.tableRef(CONFIG.BQ.TABLES.USERS) + '`' +
        " WHERE email = '" + email + "'"
      );
    } catch (e) { /* table may be empty — safe to ignore */ }

    BQ.insertRows(CONFIG.BQ.TABLES.USERS, [{
      user_id:       Util.generateId(),
      email:         email,
      display_name:  'Faizan Mughal',
      role:          'admin',
      password_hash: hash,
      is_active:     true,
      created_at:    new Date().toISOString(),
      last_login:    null
    }]);

    return 'Super admin created: ' + email;
  },

  _createSession: function (user) {
    var token = Util.generateId() + Util.generateId();
    CacheService.getScriptCache().put(
      'sess_' + token,
      JSON.stringify({
        userId:      user.user_id,
        email:       user.email,
        displayName: user.display_name,
        role:        user.role,
        createdAt:   new Date().toISOString()
      }),
      CONFIG.AUTH.SESSION_CACHE_SECONDS
    );
    return token;
  },

  _hash: function (text) {
    var bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      text,
      Utilities.Charset.UTF_8
    );
    return bytes.map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    }).join('');
  }
};
