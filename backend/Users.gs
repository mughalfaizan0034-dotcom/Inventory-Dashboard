'use strict';

var Users = {

  getUsers: function () {
    var sql = [
      'SELECT user_id, email, display_name, role, is_active, created_at, last_login',
      'FROM `' + BQ.tableRef(CONFIG.BQ.TABLES.USERS) + '`',
      'ORDER BY created_at DESC'
    ].join('\n');
    return BQ.runQuery(sql) || [];
  },

  createUser: function (email, displayName, role, password) {
    if (!email || !displayName || !role || !password) {
      return Util.error('email, displayName, role, and password are all required');
    }
    email = email.toLowerCase().trim();

    var validRoles = Object.values(CONFIG.AUTH.ROLES);
    if (validRoles.indexOf(role) === -1) {
      return Util.error('Invalid role "' + role + '". Must be one of: ' + validRoles.join(', '));
    }

    // Duplicate check
    var checkSql = [
      'SELECT COUNT(*) AS cnt',
      'FROM `' + BQ.tableRef(CONFIG.BQ.TABLES.USERS) + '`',
      "WHERE email = '" + Util.escapeSql(email) + "'"
    ].join('\n');
    var checkRows = BQ.runQuery(checkSql);
    if (checkRows && checkRows[0] && Number(checkRows[0].cnt) > 0) {
      return Util.error('A user with email "' + email + '" already exists');
    }

    var row = {
      user_id:       Util.generateId(),
      email:         email,
      display_name:  displayName.trim(),
      role:          role,
      password_hash: Auth._hash(password),
      is_active:     true,
      created_at:    new Date().toISOString(),
      last_login:    null
    };

    BQ.insertRows(CONFIG.BQ.TABLES.USERS, [row]);
    Debug.log('Users', 'createUser', 'success', { email: email, role: role });

    return Util.success({ userId: row.user_id, email: email, role: role });
  },

  updateUser: function (userId, updates) {
    if (!userId) return Util.error('userId is required');

    var sets = [];
    if (updates.displayName !== undefined) {
      sets.push("display_name = '" + Util.escapeSql(updates.displayName) + "'");
    }
    if (updates.role !== undefined) {
      var validRoles = Object.values(CONFIG.AUTH.ROLES);
      if (validRoles.indexOf(updates.role) === -1) {
        return Util.error('Invalid role: ' + updates.role);
      }
      sets.push("role = '" + Util.escapeSql(updates.role) + "'");
    }
    if (updates.isActive !== undefined) {
      sets.push('is_active = ' + (updates.isActive ? 'TRUE' : 'FALSE'));
    }
    if (updates.password) {
      sets.push("password_hash = '" + Auth._hash(updates.password) + "'");
    }

    if (!sets.length) return Util.error('No valid fields to update');

    var sql = [
      'UPDATE `' + BQ.tableRef(CONFIG.BQ.TABLES.USERS) + '`',
      'SET ' + sets.join(', '),
      "WHERE user_id = '" + Util.escapeSql(userId) + "'"
    ].join(' ');

    BQ.runDML(sql);
    Debug.log('Users', 'updateUser', 'success', { userId: userId });
    return Util.success({ message: 'User updated successfully' });
  },

  deleteUser: function (userId) {
    if (!userId) return Util.error('userId is required');

    BQ.runDML(
      'DELETE FROM `' + BQ.tableRef(CONFIG.BQ.TABLES.USERS) + '`' +
      " WHERE user_id = '" + Util.escapeSql(userId) + "'"
    );

    Debug.log('Users', 'deleteUser', 'success', { userId: userId });
    return Util.success({ message: 'User deleted successfully' });
  }
};
