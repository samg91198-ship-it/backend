const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nexTrade_secret_change_this';

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Admin token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ message: 'Not an admin' });
    }
    req.adminId = decoded.adminId;   // optional, not really needed
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid admin token' });
  }
}

module.exports = adminAuth;