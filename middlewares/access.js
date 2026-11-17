export function requireSession({ sessions, cookie, account }) {
  return async (req,res,next) => {
    const session = sessions.get(cookie(req));
    const user = session && session.until > Date.now() && await account(session.email);
    if (!user || user.disabled || user.hash !== session.hash || (user.temporary && user.expires <= new Date().toISOString())) return res.status(401).json({error:'Sign in to continue.'});
    req.user = user;
    next();
  };
}

export function requirePermanentPassword(req,res,next) {
  if (req.user.temporary) return res.status(403).json({error:'Change your temporary password first.'});
  next();
}
export function requireAdmin(req,res,next) {
  if (req.user.role !== 'admin') return res.status(403).json({error:'Superadmin access required.'});
  next();
}
