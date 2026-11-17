export function securityHeaders(req,res,next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
}

export function jsonRequests(req,res,next) {
    res.set('Cache-Control','no-store');
    if (['POST','PATCH','PUT'].includes(req.method) && !req.is('application/json')) return res.status(415).json({error:'Send a JSON request.'});
    next();
}

export function handleError(error,_req,res,_next) {
  if (error.status === 413) return res.status(413).json({ error: 'The upload is too large.' });
  if (error.status === 400) return res.status(400).json({ error: 'Invalid request body.' });
  console.error(error.message);
  res.status(500).json({ error: 'Storage is unavailable. Please try again.' });
}
