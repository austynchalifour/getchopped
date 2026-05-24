import fs from 'node:fs';
import { google } from 'googleapis';

export async function getProfile(auth) {
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const { data } = await oauth2.userinfo.get();
  return data;
}

export async function listChannels(auth) {
  const youtube = google.youtube({ version: 'v3', auth });
  const { data } = await youtube.channels.list({
    mine: true,
    part: ['id', 'snippet', 'statistics', 'contentDetails']
  });

  return (data.items || []).map((channel) => ({
    id: channel.id,
    title: channel.snippet?.title || 'Untitled channel',
    description: channel.snippet?.description || '',
    thumbnail: channel.snippet?.thumbnails?.default?.url || '',
    subscriberCount: channel.statistics?.subscriberCount || '0',
    uploadPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || ''
  }));
}

export async function listChannelVideos(auth, channelId) {
  const youtube = google.youtube({ version: 'v3', auth });
  const channels = await youtube.channels.list({
    id: [channelId],
    part: ['contentDetails']
  });
  const uploadPlaylistId = channels.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadPlaylistId) return [];

  const { data } = await youtube.playlistItems.list({
    playlistId: uploadPlaylistId,
    part: ['snippet', 'contentDetails'],
    maxResults: 25
  });

  return (data.items || []).map((item) => ({
    id: item.contentDetails?.videoId,
    title: item.snippet?.title || 'Untitled video',
    publishedAt: item.snippet?.publishedAt,
    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
    url: `https://www.youtube.com/watch?v=${item.contentDetails?.videoId}`
  }));
}

export async function uploadVideo(auth, { filePath, title, description, tags }) {
  const youtube = google.youtube({ version: 'v3', auth });
  const { data } = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        tags
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    },
    media: {
      body: fs.createReadStream(filePath)
    }
  });

  return {
    id: data.id,
    url: `https://www.youtube.com/watch?v=${data.id}`
  };
}

export async function setThumbnail(auth, videoId, thumbnailPath) {
  const youtube = google.youtube({ version: 'v3', auth });
  await youtube.thumbnails.set({
    videoId,
    media: {
      body: fs.createReadStream(thumbnailPath)
    }
  });
}
