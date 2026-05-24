import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  LogOut,
  Play,
  Radio,
  RefreshCw,
  Scissors,
  Sparkles,
  UploadCloud,
  Wand2
} from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || '';

function App() {
  const [route, setRoute] = useState(() => parseRoute());
  const [me, setMe] = useState({ connected: false, loading: true });

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    api('/api/me')
      .then(setMe)
      .catch(() => setMe({ connected: false }))
      .finally(() => setMe((value) => ({ ...value, loading: false })));
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute());
  };

  if (route.page === 'job') {
    return <Shell me={me} navigate={navigate}><JobDetail jobId={route.id} /></Shell>;
  }

  if (route.page === 'new') {
    return <Shell me={me} navigate={navigate}><NewJob navigate={navigate} /></Shell>;
  }

  if (route.page === 'dashboard') {
    return <Shell me={me} navigate={navigate}><Dashboard navigate={navigate} /></Shell>;
  }

  return <Landing me={me} navigate={navigate} />;
}

function Landing({ me, navigate }) {
  return (
    <main className="landing">
      <nav className="topbar">
        <Brand />
        <button className="ghost" onClick={() => navigate('/dashboard')}>Dashboard</button>
      </nav>

      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Autonomous YouTube clipping</p>
          <h1>Turn long videos into published clips while you do literally anything else.</h1>
          <p className="heroText">GetChopped transcribes, finds viral moments, writes metadata, generates thumbnails, trims with FFmpeg, uploads to YouTube, and streams every step live.</p>
          <div className="heroActions">
            {me.connected ? (
              <button className="primary" onClick={() => navigate('/new')}>Start a job <ArrowRight size={18} /></button>
            ) : (
              <a className="primary" href="/auth/google">Connect YouTube <ArrowRight size={18} /></a>
            )}
          </div>
        </div>

        <div className="pipelinePanel">
          <div className="panelHeader">
            <span>Pipeline</span>
            <Radio size={17} />
          </div>
          {[
            ['OAuth', 'Channel connected', CheckCircle2],
            ['Transcript', 'RapidAPI Whisper pass', Sparkles],
            ['Claude', '3-6 viral cuts selected', Wand2],
            ['FFmpeg', 'H.264 MP4 clips rendered', Scissors],
            ['YouTube', 'Upload + thumbnail set', UploadCloud]
          ].map(([label, text, Icon]) => (
            <div className="pipelineStep" key={label}>
              <Icon size={18} />
              <div>
                <strong>{label}</strong>
                <span>{text}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Shell({ children, me, navigate }) {
  return (
    <div className="appFrame">
      <aside className="sidebar">
        <Brand />
        <button onClick={() => navigate('/dashboard')}><Clapperboard size={18} /> Jobs</button>
        <button onClick={() => navigate('/new')}><Scissors size={18} /> New Job</button>
        <div className="sideFooter">
          <span>{me.connected ? me.profile?.name || 'YouTube connected' : 'Not connected'}</span>
          {me.connected ? <button className="iconButton" onClick={() => api('/auth/logout', { method: 'POST' }).then(() => window.location.href = '/')}><LogOut size={16} /></button> : null}
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

function Dashboard({ navigate }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api('/api/jobs').then((data) => setJobs(data.jobs || [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageTitle label="Dashboard" title="Automation Jobs" action={<button className="primary small" onClick={() => navigate('/new')}>New Job <ArrowRight size={16} /></button>} />
      <section className="tableSurface">
        <div className="tableHeader">
          <span>Job</span>
          <span>Status</span>
          <span>Clips</span>
          <span>Target</span>
        </div>
        {loading ? <Empty icon={Loader2} text="Loading jobs" spin /> : null}
        {!loading && !jobs.length ? <Empty icon={Clapperboard} text="No jobs yet" /> : null}
        {jobs.map((job) => (
          <button className="jobRow" key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}>
            <span>
              <strong>{job.sourceVideoId || compactUrl(job.sourceUrl)}</strong>
              <small>{new Date(job.createdAt).toLocaleString()}</small>
            </span>
            <Status status={job.status} />
            <span className="mono">{job.clipCount}</span>
            <span>{job.targetChannelTitle}</span>
          </button>
        ))}
      </section>
    </>
  );
}

function NewJob({ navigate }) {
  const [channels, setChannels] = useState([]);
  const [videos, setVideos] = useState([]);
  const [mode, setMode] = useState('url');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceVideo, setSourceVideo] = useState(null);
  const [targetChannelId, setTargetChannelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const targetChannel = channels.find((channel) => channel.id === targetChannelId);

  useEffect(() => {
    api('/api/channels')
      .then((data) => {
        setChannels(data.channels || []);
        setTargetChannelId(data.channels?.[0]?.id || '');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (mode !== 'browse' || !targetChannelId) return;
    api(`/api/channels/${targetChannelId}/videos`).then((data) => setVideos(data.videos || []));
  }, [mode, targetChannelId]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const selectedUrl = mode === 'browse' ? sourceVideo?.url : sourceUrl;
      const data = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          sourceUrl: selectedUrl,
          sourceVideoId: sourceVideo?.id,
          targetChannelId,
          targetChannelTitle: targetChannel?.title,
          mode
        })
      });
      navigate(`/jobs/${data.job.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageTitle label="New Job" title="Choose a source and posting channel" />
      <form className="jobForm" onSubmit={submit}>
        <div className="controlBand">
          <button type="button" className={mode === 'url' ? 'selected' : ''} onClick={() => setMode('url')}><LinkIcon size={17} /> Paste URL</button>
          <button type="button" className={mode === 'browse' ? 'selected' : ''} onClick={() => setMode('browse')}><Play size={17} /> Browse Videos</button>
        </div>

        <label className="field">
          <span>Upload destination</span>
          <select value={targetChannelId} onChange={(event) => setTargetChannelId(event.target.value)} disabled={loading}>
            {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.title}</option>)}
          </select>
        </label>

        {mode === 'url' ? (
          <label className="field">
            <span>YouTube source URL</span>
            <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." required />
          </label>
        ) : (
          <div className="videoGrid">
            {videos.map((video) => (
              <button type="button" className={sourceVideo?.id === video.id ? 'video selectedVideo' : 'video'} key={video.id} onClick={() => setSourceVideo(video)}>
                {video.thumbnail ? <img src={video.thumbnail} alt="" /> : <div />}
                <span>{video.title}</span>
              </button>
            ))}
          </div>
        )}

        <button className="primary submit" disabled={submitting || !targetChannelId || (mode === 'browse' ? !sourceVideo : !sourceUrl)}>
          {submitting ? <Loader2 className="spin" size={18} /> : <Scissors size={18} />}
          Start Automation
        </button>
      </form>
    </>
  );
}

function JobDetail({ jobId }) {
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api(`/api/jobs/${jobId}`).then((data) => {
      setJob(data.job);
      setLogs(data.logs || []);
    });

    const stream = new EventSource(`/jobs/${jobId}/stream`);
    stream.addEventListener('job', (event) => setJob(JSON.parse(event.data)));
    stream.addEventListener('log', (event) => setLogs((items) => [...items, JSON.parse(event.data)]));
    stream.addEventListener('clip', (event) => {
      const clip = JSON.parse(event.data);
      setJob((current) => current ? { ...current, clips: upsert(current.clips || [], clip), clipCount: upsert(current.clips || [], clip).length } : current);
    });
    stream.addEventListener('clipUpdate', (event) => {
      const clip = JSON.parse(event.data);
      setJob((current) => current ? { ...current, clips: upsert(current.clips || [], clip) } : current);
    });
    return () => stream.close();
  }, [jobId]);

  const clips = job?.clips || [];

  return (
    <>
      <PageTitle label="Job Detail" title={job ? compactUrl(job.sourceUrl) : 'Loading job'} action={job ? <Status status={job.status} /> : null} />
      <div className="detailGrid">
        <section className="logPanel">
          <div className="panelHeader"><span>Live log</span><RefreshCw size={16} /></div>
          <div className="logs">
            {logs.map((log) => (
              <div className={`logLine ${log.level}`} key={log.id}>
                <time>{new Date(log.at).toLocaleTimeString()}</time>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="clipsPanel">
          {clips.length ? clips.map((clip) => <ClipCard clip={clip} key={clip.id} />) : <Empty icon={Scissors} text="Clips will appear here" />}
        </section>
      </div>
    </>
  );
}

function ClipCard({ clip }) {
  return (
    <article className="clipCard">
      <div className="clipTop">
        <span className="mono">{formatTime(clip.startSec)} - {formatTime(clip.endSec)}</span>
        <Status status={clip.status} />
      </div>
      <h3>{clip.title}</h3>
      <p>{clip.viralReason}</p>
      <div className="tags">{(clip.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div>
      {clip.youtubeUrl ? <a className="external" href={clip.youtubeUrl} target="_blank" rel="noreferrer">Open on YouTube <ExternalLink size={15} /></a> : null}
    </article>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="mark">GC</span>
      <span>GetChopped</span>
    </div>
  );
}

function PageTitle({ label, title, action }) {
  return (
    <header className="pageTitle">
      <div>
        <p className="eyebrow">{label}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

function Status({ status }) {
  return <span className={`status ${status}`}>{status}</span>;
}

function Empty({ icon: Icon, text, spin }) {
  return <div className="empty"><Icon className={spin ? 'spin' : ''} size={22} /><span>{text}</span></div>;
}

function parseRoute() {
  const path = window.location.pathname;
  if (path === '/dashboard') return { page: 'dashboard' };
  if (path === '/new') return { page: 'new' };
  const job = path.match(/^\/jobs\/([^/]+)/);
  if (job) return { page: 'job', id: job[1] };
  return { page: 'landing' };
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

function compactUrl(url = '') {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop() || url;
  } catch {
    return url;
  }
}

function formatTime(value = 0) {
  const minutes = Math.floor(Number(value) / 60);
  const seconds = Math.floor(Number(value) % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function upsert(items, item) {
  const exists = items.some((existing) => existing.id === item.id);
  return exists ? items.map((existing) => existing.id === item.id ? item : existing) : [...items, item];
}

createRoot(document.getElementById('root')).render(<App />);
