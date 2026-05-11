import bcrypt from 'bcryptjs';
import { sha256, isBcryptHash } from '../utils/hash.js';
import { AppError } from '../utils/errors.js';

const BCRYPT_ROUNDS = 12;

// Usernames are globally unique across the platform.
// Organization is derived from the user record — never supplied by the caller.
export function createAuthService({ usersRepo }) {
  async function login(username, password) {
    // Normalize before querying — usernames are stored lowercase
    const normalized = username.toLowerCase().trim();

    const user = await usersRepo.findByUsernameGlobal(normalized);
    if (!user) {
      throw new AppError(401, 'Invalid credentials');
    }

    const valid = await _verifyPassword(password, user.password_hash);
    if (!valid) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Upgrade SHA-256 legacy hash to bcrypt on first successful login
    if (!isBcryptHash(user.password_hash)) {
      const upgraded = await bcrypt.hash(password, BCRYPT_ROUNDS);
      usersRepo.updatePasswordHash(user.user_id, upgraded).catch(() => {});
    }

    return {
      user_id:         user.user_id,
      organization_id: user.organization_id,
      username:        user.username,
      display_name:    user.display_name,
      role:            user.role,
    };
  }

  return { login };
}

async function _verifyPassword(plaintext, hash) {
  if (isBcryptHash(hash)) {
    return bcrypt.compare(plaintext, hash);
  }
  return sha256(plaintext) === hash;
}
