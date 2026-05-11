// Stub for stateless-to-stateful refresh token upgrade.
//
// Currently refresh tokens carry a jti claim (randomUUID) but revocation is
// not persisted — any valid, unexpired refresh token can be used once.
//
// To enable true revocation (e.g. after logout or password change):
//   1. Create a BigQuery table:
//        refresh_tokens(jti STRING, user_id STRING, organization_id STRING,
//                       created_at TIMESTAMP, expires_at TIMESTAMP, revoked BOOL)
//   2. Call save() on every signRefreshToken
//   3. Call isRevoked() at the top of POST /auth/refresh before issuing new tokens
//   4. Call revoke() on logout and password change
//
// Wire this repo into server.js exactly like usersRepo.

export function createRefreshTokensRepository({ bq, projectId }) {
  void { bq, projectId }; // suppress lint until implemented

  async function save(_jti, _userId, _organizationId, _expiresAt) {
    // INSERT INTO refresh_tokens (jti, user_id, organization_id, expires_at, revoked)
    // VALUES (@jti, @userId, @organizationId, @expiresAt, FALSE)
  }

  async function isRevoked(_jti) {
    // SELECT revoked FROM refresh_tokens WHERE jti = @jti LIMIT 1
    // return row?.revoked ?? true  (unknown jti = treat as revoked)
    return false;
  }

  async function revoke(_jti) {
    // UPDATE refresh_tokens SET revoked = TRUE WHERE jti = @jti
  }

  async function revokeAllForUser(_userId) {
    // UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = @userId
  }

  return { save, isRevoked, revoke, revokeAllForUser };
}
