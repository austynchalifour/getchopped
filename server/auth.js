import { google } from 'googleapis';
import crypto from 'node:crypto';
import { config } from './config.js';

export const tokenStore = new Map();

const scopes = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.profile'
];

export function createOAuthClient(userId) {
  const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );

  const saved = tokenStore.get(userId);
  if (saved) {
    oauth2Client.setCredentials(saved);
  }

  oauth2Client.on('tokens', (tokens) => {
    const existing = tokenStore.get(userId) || {};
    tokenStore.set(userId, { ...existing, ...tokens });
  });

  return oauth2Client;
}

export function getAuthUrl(req) {
  const userId = ensureUserId(req);
  const client = createOAuthClient(userId);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes
  });
}

export async function handleOAuthCallback(req) {
  const userId = ensureUserId(req);
  const client = createOAuthClient(userId);
  const { tokens } = await client.getToken(req.query.code);
  tokenStore.set(userId, tokens);
  client.setCredentials(tokens);
  return tokens;
}

export function ensureUserId(req) {
  if (!req.session.userId) {
    req.session.userId = crypto.randomUUID();
  }
  return req.session.userId;
}

export function requireOAuth(req, res, next) {
  const userId = ensureUserId(req);
  if (!tokenStore.has(userId)) {
    return res.status(401).json({ error: 'YouTube connection required' });
  }
  req.oauthClient = createOAuthClient(userId);
  return next();
}
