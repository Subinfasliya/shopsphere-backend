const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const { randomToken, hashToken } = require('../utils/tokenUtils');

const accessCookie = 'accessToken';
const refreshCookie = 'refreshToken';
const sessionHintCookie = 'sessionHint';

const parseDuration = (value, fallbackSeconds) => {
  const match = String(value || '').match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackSeconds * 1000;
  const n = Number(match[1]);
  const factor = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()];
  return n * factor;
};

const accessTtlMs = () => parseDuration(process.env.ACCESS_TOKEN_TTL || '15m', 900);
const refreshTtlMs = () => parseDuration(process.env.REFRESH_TOKEN_TTL || '7d', 604800);

const cookieOptions = (maxAge, httpOnly) => ({
  httpOnly,
  secure: process.env.NODE_ENV === 'production' || String(process.env.COOKIE_SECURE).toLowerCase() === 'true',
  sameSite: process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax'),
  path: '/',
  maxAge,
});

const issueAccessToken = (user) => jwt.sign(
  { sub: user._id.toString(), role: user.role, sv: user.sessionVersion },
  process.env.JWT_SECRET_KEY,
  {
    expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
    issuer: process.env.JWT_ISSUER || 'shopsphere-api',
    audience: process.env.JWT_AUDIENCE || 'shopsphere-web',
  }
);

const createRefreshSession = async ({ user, req }) => {
  const raw = randomToken(48);
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + refreshTtlMs());
  await RefreshToken.create({
    user: user._id,
    tokenHash,
    expiresAt,
    userAgent: String(req.get('user-agent') || '').slice(0, 500),
    ip: String(req.ip || '').slice(0, 100),
  });
  return { raw, expiresAt };
};

const setAuthCookies = ({ res, accessToken, refreshToken, refreshTtl }) => {
  res.cookie(accessCookie, accessToken, cookieOptions(accessTtlMs(), true));
  res.cookie(refreshCookie, refreshToken, cookieOptions(refreshTtl, true));
  res.cookie(sessionHintCookie, '1', { ...cookieOptions(refreshTtl, false), httpOnly: false });
};

const issueSession = async ({ res, user, req }) => {
  const sessionUser = await User.findById(user._id).select('role sessionVersion');
  if (!sessionUser || sessionUser.isActive === false) throw new Error('User is unavailable');
  const accessToken = issueAccessToken(sessionUser);
  const refresh = await createRefreshSession({ user: sessionUser, req });
  setAuthCookies({ res, accessToken, refreshToken: refresh.raw, refreshTtl: refreshTtlMs() });
};

const invalidateAllSessions = async (userId) => {
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } });
};

const rotateRefreshSession = async ({ res, req, rawToken }) => {
  if (!rawToken) return null;
  const currentHash = hashToken(rawToken);
  const current = await RefreshToken.findOne({ tokenHash: currentHash });
  if (!current) return null;
  if (current.revokedAt) {
    await invalidateAllSessions(current.user);
    return null;
  }
  if (current.expiresAt <= new Date()) return null;

  const user = await User.findById(current.user).select('role sessionVersion isActive');
  if (!user || user.isActive === false) return null;

  const nextRaw = randomToken(48);
  const nextHash = hashToken(nextRaw);
  const nextExpires = new Date(Date.now() + refreshTtlMs());

  // Atomic claim prevents two concurrent refresh requests rotating the same token twice.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: current._id, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date(), replacedByTokenHash: nextHash } },
    { returnDocument: 'before' }
  );
  if (!claimed) return null;

  await RefreshToken.create({
    user: user._id,
    tokenHash: nextHash,
    expiresAt: nextExpires,
    userAgent: String(req.get('user-agent') || '').slice(0, 500),
    ip: String(req.ip || '').slice(0, 100),
  });

  setAuthCookies({ res, accessToken: issueAccessToken(user), refreshToken: nextRaw, refreshTtl: refreshTtlMs() });
  return user;
};

const revokeRefreshSession = async (rawToken) => {
  if (!rawToken) return;
  await RefreshToken.updateOne({ tokenHash: hashToken(rawToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
};

const clearAuthCookies = (res) => {
  const base = cookieOptions(0, true);
  res.clearCookie(accessCookie, { ...base, maxAge: undefined });
  res.clearCookie(refreshCookie, { ...base, maxAge: undefined });
  res.clearCookie(sessionHintCookie, { ...base, httpOnly: false, maxAge: undefined });
};

module.exports = {
  accessCookie,
  refreshCookie,
  sessionHintCookie,
  issueSession,
  rotateRefreshSession,
  revokeRefreshSession,
  invalidateAllSessions,
  revokeAllUserSessions: invalidateAllSessions,
  clearAuthCookies,
};
