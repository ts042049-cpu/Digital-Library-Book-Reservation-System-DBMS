/**
 * Authentication and Role-Based Authorization Middleware
 * Uses Express Session with credentials: "include"
 */

function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
    }
    return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in to continue.'
    });
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please log in to continue.'
            });
        }
        if (!allowedRoles.includes(req.session.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Forbidden: This action requires [${allowedRoles.join(', ')}] privileges. Your role is ${req.session.user.role}.`
            });
        }
        next();
    };
}

module.exports = {
    requireAuth,
    requireRole
};
