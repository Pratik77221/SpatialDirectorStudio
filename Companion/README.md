# Spatial Director Companion

The dashboard runs immediately in demo mode and switches to the real native Supabase project when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.

```powershell
cd "E:\Snap Projects\Director\Companion"
npm start
```

Open `http://127.0.0.1:4173`. Demo mode uses the Lens validation captures and requires no credentials.

For Supabase mode, copy `.env.example` values into your shell environment, run `npm install`, apply `../Assets/SpatialDirectorCompanion/supabase-schema.sql`, then start the server. The service role key stays server-side; never put it in browser code. When the Supabase CLI is authenticated, `start-dashboard.ps1` and `start-processor.ps1` retrieve that key at launch without writing it into the project.

Run `npm run processor` in a persistent Node environment with FFmpeg support. With `PROCESSOR_POLL=true`, it claims frame-ready takes that do not yet have an MP4, renders them, uploads `output.mp4`, and marks the take ready again. The authenticated `/process` endpoint is also available for an explicit job trigger.

The dashboard supports take selection, upload/processing/ready states, timestamp-driven JPEG sequence playback, MP4 playback when available, manifest/video download, and share-link copying.
