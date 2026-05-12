import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { AppError } from '../utils/errors.js';

const BCRYPT_ROUNDS = 12;
const VALID_ROLES   = ['admin', 'manager', 'staff', 'viewer'];

export function createUsersService({ usersRepo, membershipsRepo, usernameService }) {

  // List members of a given organization (via memberships join).
  async function list(organizationId) {
    return membershipsRepo.getMembersByOrg(organizationId);
  }

  // Find global user by username — used by the "add existing user" flow.
  async function findByUsername(username) {
    const user = await usersRepo.findByUsernameGlobal(username);
    if (!user) return null;
    return {
      user_id:      user.user_id,
      username:     user.username,
      display_name: user.display_name,
      is_active:    user.is_active,
    };
  }

  // Create a new global user AND a membership for the given organization.
  async function create(organizationId, { display_name, username: rawUsername, password, role }) {
    if (!display_name?.trim()) throw new AppError(400, 'display_name is required');
    if (!password || password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
    if (role && !VALID_ROLES.includes(role)) {
      throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
    }

    const baseUsername = rawUsername || display_name;
    const username = await (async () => {
      const normalized = usernameService.normalize(baseUsername);
      if (usernameService.isValid(normalized) && await usernameService.isAvailable(normalized)) {
        return normalized;
      }
      const [suggestion] = await usernameService.suggest(baseUsername, 1);
      if (!suggestion) throw new AppError(409, 'Could not generate a unique username — provide one explicitly');
      return suggestion;
    })();

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId       = randomUUID();
    const membershipId = randomUUID();
    const assignedRole = role || 'viewer';

    await usersRepo.insert({
      user_id:       userId,
      username,
      email:         null,
      display_name:  display_name.trim(),
      password_hash: passwordHash,
      is_active:     true,
    });

    await membershipsRepo.createMembership({
      membership_id:   membershipId,
      user_id:         userId,
      organization_id: organizationId,
      role:            assignedRole,
    });

    return { user_id: userId, membership_id: membershipId, username, display_name: display_name.trim(), role: assignedRole };
  }

  // Update membership and/or user profile.
  // Accepted fields: role, is_active (membership) | display_name, password (user profile).
  async function updateUser(membershipId, organizationId, updates) {
    const membership = await membershipsRepo.getMembershipById(membershipId);
    if (!membership || membership.organization_id !== organizationId) {
      throw new AppError(404, 'Membership not found');
    }

    const membershipUpdates = {};
    if (updates.role !== undefined) {
      if (!VALID_ROLES.includes(updates.role)) {
        throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
      }
      membershipUpdates.role = updates.role;
    }
    if (updates.is_active !== undefined) membershipUpdates.is_active = updates.is_active;

    if (Object.keys(membershipUpdates).length > 0) {
      await membershipsRepo.updateMembership(membershipId, membershipUpdates);
    }

    if (updates.display_name !== undefined) {
      await usersRepo.update(membership.user_id, { display_name: updates.display_name.trim() });
    }

    if (updates.password !== undefined) {
      if (updates.password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
      const hash = await bcrypt.hash(updates.password, BCRYPT_ROUNDS);
      await usersRepo.updatePasswordHash(membership.user_id, hash);
    }
  }

  // Kept for backwards-compat with existing route (membership-only updates).
  async function updateMembership(membershipId, organizationId, updates) {
    return updateUser(membershipId, organizationId, updates);
  }

  // Deactivate membership (does not delete global user account).
  async function deactivateMembership(membershipId, organizationId, requestingMembershipId) {
    if (membershipId === requestingMembershipId) throw new AppError(400, 'Cannot remove your own membership');
    const membership = await membershipsRepo.getMembershipById(membershipId);
    if (!membership || membership.organization_id !== organizationId) {
      throw new AppError(404, 'Membership not found');
    }
    await membershipsRepo.updateMembership(membershipId, { is_active: false });
  }

  return { list, findByUsername, create, updateUser, updateMembership, deactivateMembership };
}
