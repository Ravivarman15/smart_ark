// ─────────────────────────────────────────────────────────────────────────────
// MCQ ownership & sharing access rules — one place decides who may touch what.
//
//   • management / admin  — full access to every paper and question
//   • coordinator         — manages all papers/questions (scheduling authority)
//   • teacher             — manages only the papers/questions they own
//
// Sharing a paper or question to the GLOBAL bank is restricted to admin /
// management ("restricted sharing controls"). Pure predicates — no I/O.
// ─────────────────────────────────────────────────────────────────────────────

export interface AccessUser {
  profileId?: string;
  role?: string;
}

const FULL_ACCESS_ROLES = ["admin", "management", "coordinator"];

/** Can this user edit / delete / clone a paper? */
export const canManagePaper = (
  paper: { ownerId?: string },
  user: AccessUser,
): boolean => {
  if (!user.role) return false;
  if (FULL_ACCESS_ROLES.includes(user.role)) return true;
  if (user.role === "teacher") {
    return !!paper.ownerId && paper.ownerId === user.profileId;
  }
  return false;
};

/** Can this user edit / delete a bank question? */
export const canManageQuestion = (
  question: { ownerId?: string; isGlobal?: boolean },
  user: AccessUser,
): boolean => {
  if (!user.role) return false;
  if (FULL_ACCESS_ROLES.includes(user.role)) return true;
  if (user.role === "teacher") {
    return !!question.ownerId && question.ownerId === user.profileId;
  }
  return false;
};

/** Only admin / management may publish a paper or question to the global bank. */
export const canShareGlobally = (user: AccessUser): boolean =>
  user.role === "admin" || user.role === "management";
