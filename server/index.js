import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config, requiredRuntimeKeys } from './config.js';
import { ensureUserId, getAuthUrl, handleOAuthCallback, requireOAuth } from './auth.js';
import { jobStore } from './jobStore.js';
import { runJob } from './pipeline.js';
import { getProfile, listChannelVideos, listChannels } from './youtube.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: isProduction ? false : config.clientUrl,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    sameSite: 'lax'
  }
}));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'GetChopped',
    missingKeys: requiredRuntimeKeys.filter(([, value]) => !value).map(([key]) => key)
  });
});

app.get('/auth/google', (req, res) => {
  res.redirect(getAuthUrl(req));
});

app.get('/auth/google/callback', async (req, res, next) => {
  try {
    if (!req.query.code) {
      return res.status(400).send('Missing OAuth code.');
    }
    await handleOAuthCallback(req);
    return res.redirect(`${config.clientUrl}/dashboard?connected=1`);
  } catch (error) {
    return next(error);
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', async (req, res) => {
  ensureUserId(req);
  try {
    if (!req.session.userId) return res.json({ connected: false });
    const { tokenStore, createOAuthClient } = await import('./auth.js');
    if (!tokenStore.has(req.session.userId)) return res.json({ connected: false });
    const profile = await getProfile(createOAuthClient(req.session.userId));
    return res.json({ connected: true, profile });
  } catch (error) {
    return res.json({ connected: true, profile: null, warning: error.message });
  }
});

app.get('/api/channels', requireOAuth, async (req, res, next) => {
  try {
    res.json({ channels: await listChannels(req.oauthClient) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/channels/:channelId/videos', requireOAuth, async (req, res, next) => {
  try {
    res.json({ videos: await listChannelVideos(req.oauthClient, req.params.channelId) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs', (req, res) => {
  res.json({ jobs: jobStore.listJobs() });
});

app.post('/api/jobs', requireOAuth, (req, res) => {
  const { sourceUrl, sourceVideoId, targetChannelId, targetChannelTitle, mode } = req.body;
  if (!sourceUrl) {
    return res.status(400).json({ error: 'sourceUrl is required' });
  }
  if (!targetChannelId) {
    return res.status(400).json({ error: 'targetChannelId is required' });
  }

  const job = jobStore.createJob({ sourceUrl, sourceVideoId, targetChannelId, targetChannelTitle, mode });
  const auth = req.oauthClient;
  setImmediate(() => runJob(job.id, auth));
  return res.status(202).json({ job });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobStore.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  return res.json({ job, logs: jobStore.getLogs(req.params.id) });
});

app.get('/jobs/:id/stream', (req, res) => {
  const { id } = req.params;
  const job = jobStore.getJob(id);
  if (!job) return res.status(404).end();

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  });

  const send = (type, payload) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send('job', job);
  for (const log of jobStore.getLogs(id)) {
    send('log', log);
  }
  for (const clip of job.clips) {
    send('clip', clip);
  }

  const listener = ({ type, payload }) => send(type, payload);
  jobStore.on(id, listener);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    jobStore.off(id, listener);
  });
});

if (isProduction) {
  const distPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: error.message || 'Unexpected server error' });
});

export function startServer(port = config.port) {
  return app.listen(port, () => {
    console.log(`GetChopped server running on ${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
