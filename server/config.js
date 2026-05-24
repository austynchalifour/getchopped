import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback'
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  rapidApiKey: process.env.RAPIDAPI_KEY || '',
  nanoBananaApiKey: process.env.NANOBANNA_API_KEY || '',
  ffmpegPath: process.env.FFMPEG_PATH || ''
};

export const requiredRuntimeKeys = [
  ['ANTHROPIC_API_KEY', config.anthropicApiKey],
  ['RAPIDAPI_KEY', config.rapidApiKey],
  ['NANOBANNA_API_KEY', config.nanoBananaApiKey],
  ['GOOGLE_CLIENT_ID', config.google.clientId],
  ['GOOGLE_CLIENT_SECRET', config.google.clientSecret]
];
