const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze([
    "team:view", "team:manage",
    "leads:view", "leads:create", "leads:update",
    "leads:delete", "leads:assign", "pipeline:update",
    "reports:view", "reminders:view", "reminders:manage", "memory:view", "memory:manage",
    "ai:use", "profile:view", "automation:view", "automation:manage", "custom-ai:manage", "api-webhooks:manage"]),
  admin: Object.freeze([
    "team:view",
    "leads:view", "leads:create", "leads:update",
    "leads:delete", "leads:assign", "pipeline:update",
    "reports:view", "reminders:view", "reminders:manage", "memory:view", "memory:manage",
    "ai:use", "profile:view", "automation:view", "automation:manage", "custom-ai:manage", "api-webhooks:manage"]),
  manager: Object.freeze([
    "team:view",
    "leads:view", "leads:create", "leads:update",
    "pipeline:update", "reports:view", "reminders:view", "reminders:manage",
    "memory:view", "ai:use", "profile:view", "automation:view", "automation:manage"
  ]),
  sales: Object.freeze([
    "leads:view", "leads:create", "leads:update",
    "pipeline:update", "reports:view", "reminders:view", "reminders:manage",
    "ai:use", "profile:view"
  ]),
  viewer: Object.freeze([
    "leads:view", "reports:view", "reminders:view",
    "memory:view", "profile:view"
  ])
});

export { ROLE_PERMISSIONS };

export function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.user?.role;
    const allowed = ROLE_PERMISSIONS[role]?.includes(permission);

    if (!allowed) {
      return res.status(403).json({
        error: "You do not have permission to perform this action.",
        requiredPermission: permission,
        currentRole: role || "unknown"
      });
    }

    return next();
  };
}
