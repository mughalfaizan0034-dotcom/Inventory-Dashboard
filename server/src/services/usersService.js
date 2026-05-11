import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { AppError } from '../utils/errors.js';

const BCRYPT_ROUNDS = 12;
const VALID_ROLES   = ['admin', 'manager', 'operator', 'viewer'];

export function createUsersService({ usersRepo, usernameService }) {
  async function list(organizationId) {
    return usersRepo.findAllByOrg(organizationId);
  }

  async function create(organizationId, { display_name, email, username: rawUsername, password, role }) {
    if (!display_name?.trim()) throw new AppError(400, 'display_name is required');
    if (!password || password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
    if (role && !VALID_ROLES.includes(role)) throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);

    // Derive username from email or display_name if not supplied
    const baseUsername = rawUsername || email?.split('@')[0] || display_name;
    const username = await (async () => {
      const normalized = usernameService.normalize(baseUsername);
      if (usernameService.isValid(normalized) && await usernameService.isAvailable(organizationId, normalized)) {
        return normalized;
      }
      const [suggestion] = await usernameService.suggest(organizationId, baseUsername, 1);
      if (!suggestion) throw new AppError(409, 'Could not generate a unique username — try providing one explicitly');
      return suggestion;
    })();

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = randomUUID();

    await usersRepo.insert({
      user_id:         userId,
      organization_id: organizationId,
      username,
      email:           email?.trim() || null,
      display_name:    display_name.trim(),
      password_hash:   passwordHash,
      role:            role || 'viewer',
      is_active:       true,
    });

    return { user_id: userId, username, display_name: display_name.trim(), role: role || 'viewer' };
  }

  async function update(userId, organizationId, updates) {
    const user = await usersRepo.findById(userId);
    if (!user || user.organization_id !== organizationId) {
      throw new AppError(404, 'User not found');
    }
    if (updates.role && !VALID_ROLES.includes(updates.role)) {
      throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    await usersRepo.update(userId, updates);
  }

  async function deactivate(userId, organizationId, requestingUserId) {
    if (userId === requestingUserId) throw new AppError(400, 'Cannot deactivate your own account');
    const user = await usersRepo.findById(userId);
    if (!user || user.organization_id !== organizationId) {
      throw new AppError(404, 'User not found');
    }
    await usersRepo.update(userId, { is_active: false });
  }

  return { list, create, update, deactivate };
}
