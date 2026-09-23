function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acción no permitida para el rol "${req.user ? req.user.role : 'desconocido'}"`,
      });
    }
    next();
  };
}

module.exports = { allowRoles };
