import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import ffmpeg from 'fluent-ffmpeg';
import { config } from './config.js';

if (config.ffmpegPath) {
  ffmpeg.setFfmpegPath(config.ffmpegPath);
}

export async function transcribeYouTubeUrl(youtubeUrl) {
  const { data } = await axios.post(
    'https://speech-to-text-ai.p.rapidapi.com/transcribe',
    { url: youtubeUrl },
    {
      headers: {
        'content-type': 'application/json',
        'x-rapidapi-host': 'speech-to-text-ai.p.rapidapi.com',
        'x-rapidapi-key': config.rapidApiKey
      },
      timeout: 1000 * 60 * 8
    }
  );

  return normalizeTranscript(data);
}

export function normalizeTranscript(payload) {
  if (!payload) {
    return { text: '', segments: [] };
  }

  const sourceSegments = Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(payload.segments)
      ? payload.segments
      : [];

  if (sourceSegments.length) {
    const segments = sourceSegments.map((segment, index) => ({
      index,
      startSec: Number(segment.start ?? segment.startSec ?? segment.timestamp?.start ?? 0),
      endSec: Number(segment.end ?? segment.endSec ?? segment.timestamp?.end ?? 0),
      text: String(segment.text ?? segment.transcript ?? segment.content ?? '').trim()
    }));
    return {
      text: segments.map((segment) => segment.text).filter(Boolean).join(' '),
      segments
    };
  }

  const text = typeof payload === 'string'
    ? payload
    : String(payload.text ?? payload.transcript ?? payload.result ?? '');

  return {
    text,
    segments: text ? [{ index: 0, startSec: 0, endSec: 0, text }] : []
  };
}

export async function identifyViralClips(transcript) {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 5000,
    temperature: 0.3,
    system: 'You are a senior short-form video editor. Return only strict JSON.',
    messages: [
      {
        role: 'user',
        content: `Analyze this timestamped YouTube transcript and identify 3 to 6 viral clips. Return a JSON array only. Each item must include title, description, startSec, endSec, hook, tags, and viralReason. Keep clips between 20 and 90 seconds where possible.\n\n${JSON.stringify(transcript)}`
      }
    ]
  });

  return parseJsonFromClaude(message).map((clip, index) => ({
    title: String(clip.title || `Clip ${index + 1}`).slice(0, 95),
    description: String(clip.description || ''),
    startSec: Number(clip.startSec || 0),
    endSec: Number(clip.endSec || Math.max(Number(clip.startSec || 0) + 30, 30)),
    hook: String(clip.hook || ''),
    tags: Array.isArray(clip.tags) ? clip.tags.map(String).slice(0, 20) : [],
    viralReason: String(clip.viralReason || '')
  }));
}

export async function writeThumbnailPrompt(clip, transcript) {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 900,
    temperature: 0.55,
    system: 'You write vivid image prompts for 16:9 YouTube thumbnails. Return plain text only.',
    messages: [
      {
        role: 'user',
        content: `Write one high-impact text-to-image prompt for a 1280x720 thumbnail. No overlay text. Use this clip metadata and transcript context.\n\nClip:\n${JSON.stringify(clip)}\n\nTranscript summary text:\n${transcript.text.slice(0, 5000)}`
      }
    ]
  });

  return message.content?.map((part) => part.text || '').join('\n').trim() || clip.title;
}

export async function renderThumbnail(prompt, outputPath) {
  const { data } = await axios.post(
    'https://api.nanobanana.ai/v1/images/generations',
    {
      model: 'nano-banana',
      prompt,
      size: '1280x720'
    },
    {
      headers: {
        authorization: `Bearer ${config.nanoBananaApiKey}`,
        'content-type': 'application/json'
      },
      timeout: 1000 * 60 * 3
    }
  );

  const image = data?.data?.[0] || data?.images?.[0] || data;
  const b64 = image?.b64_json || image?.base64;
  const url = image?.url;

  if (b64) {
    await fs.writeFile(outputPath, Buffer.from(b64, 'base64'));
    return outputPath;
  }

  if (url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.writeFile(outputPath, Buffer.from(response.data));
    return outputPath;
  }

  throw new Error('Nano-banana response did not include an image');
}

export async function trimVideo({ sourceUrl, startSec, endSec, outputPath }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const duration = Math.max(1, endSec - startSec);

  await new Promise((resolve, reject) => {
    ffmpeg(sourceUrl)
      .inputOptions([`-ss ${startSec}`])
      .outputOptions([
        `-t ${duration}`,
        '-c:v libx264',
        '-preset veryfast',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-movflags +faststart'
      ])
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });

  return outputPath;
}

function parseJsonFromClaude(message) {
  const text = message.content?.map((part) => part.text || '').join('\n') || '';
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] || text;
  const first = candidate.indexOf('[');
  const last = candidate.lastIndexOf(']');
  const jsonText = first >= 0 && last >= first ? candidate.slice(first, last + 1) : candidate;
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) {
    throw new Error('Claude did not return a JSON array');
  }
  return parsed;
}
