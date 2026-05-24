# GetChopped

GetChopped is a full-stack YouTube clip automation app built with React, Vite, Node.js, and Express.

## Local setup

```bash
npm install
npm --prefix client install
cp .env.example .env
npm run dev
```

Backend: `http://localhost:4000`

Frontend: `http://localhost:5173`

## Production

Railway uses:

```bash
npm install && npm run build
node server/index.js
```

In production, Express serves `client/dist`.

## Notes

- Jobs, OAuth tokens, and logs are stored in memory for v1.
- FFmpeg is invoked through `fluent-ffmpeg` and can use `FFMPEG_PATH`.
- Thumbnail upload failures are logged but do not fail clip uploads.
