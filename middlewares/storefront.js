export function validateDetails(req,res,next) {
  const { name, market, landmark = '' } = req.body || {};
  for (const [value, maximum, required] of [[name, 120, true], [market, 120, true], [landmark, 300, false]]) {
    if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) {
      return res.status(400).json({ error: 'Enter a storefront and market name (up to 120 characters) and a landmark of up to 300 characters.' });
    }
  }
  req.details = { name:name.trim(), market:market.trim(), landmark:landmark.trim() };
  next();
}

export function loadStorefront(catalog) {
  return async (req,res,next) => {
    const row = await catalog.get(req.params.id);
    if (!row || (req.user.role === 'collector' && row.owner_user_id !== req.user.id)) return res.status(404).json({error:'Storefront not found.'});
    req.storefront = row;
    next();
  };
}
