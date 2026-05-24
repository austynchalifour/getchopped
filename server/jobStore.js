import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';

export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error'
};

class JobStore extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.logs = new Map();
  }

  createJob(input) {
    const now = new Date().toISOString();
    const job = {
      id: nanoid(12),
      status: JOB_STATUS.PENDING,
      createdAt: now,
      updatedAt: now,
      sourceUrl: input.sourceUrl,
      sourceVideoId: input.sourceVideoId || null,
      targetChannelId: input.targetChannelId,
      targetChannelTitle: input.targetChannelTitle || 'Connected channel',
      mode: input.mode || 'url',
      clipCount: 0,
      clips: [],
      error: null
    };

    this.jobs.set(job.id, job);
    this.logs.set(job.id, []);
    this.emitTyped(job.id, 'job', job);
    this.log(job.id, 'Job queued.');
    return job;
  }

  listJobs() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getJob(id) {
    return this.jobs.get(id) || null;
  }

  getLogs(id) {
    return this.logs.get(id) || [];
  }

  updateJob(id, patch) {
    const job = this.requireJob(id);
    const updated = {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(id, updated);
    this.emitTyped(id, 'job', updated);
    return updated;
  }

  addClip(id, clip) {
    const job = this.requireJob(id);
    const normalized = {
      id: clip.id || nanoid(10),
      status: 'pending',
      youtubeUrl: null,
      thumbnailUrl: null,
      outputPath: null,
      ...clip
    };
    const updatedClips = [...job.clips, normalized];
    this.updateJob(id, { clips: updatedClips, clipCount: updatedClips.length });
    this.emitTyped(id, 'clip', normalized);
    return normalized;
  }

  updateClip(jobId, clipId, patch) {
    const job = this.requireJob(jobId);
    let updatedClip = null;
    const clips = job.clips.map((clip) => {
      if (clip.id !== clipId) return clip;
      updatedClip = { ...clip, ...patch };
      return updatedClip;
    });
    this.updateJob(jobId, { clips });
    if (updatedClip) {
      this.emitTyped(jobId, 'clipUpdate', updatedClip);
    }
    return updatedClip;
  }

  log(jobId, message, level = 'info') {
    const event = {
      id: nanoid(10),
      type: 'log',
      level,
      message,
      at: new Date().toISOString()
    };
    const events = this.logs.get(jobId) || [];
    events.push(event);
    this.logs.set(jobId, events);
    this.emitTyped(jobId, 'log', event);
    return event;
  }

  emitTyped(jobId, type, payload) {
    this.emit(jobId, { type, payload });
    this.emit(type, { jobId, payload });
  }

  requireJob(id) {
    const job = this.getJob(id);
    if (!job) {
      throw new Error(`Job ${id} was not found`);
    }
    return job;
  }
}

export const jobStore = new JobStore();
