# AI ROOM

Private, multi-engine AI video generation studio.

## Current status
AI ROOM is live as a Vercel preview and currently runs in safe `development` provider mode. The UI, generation API, job polling, gallery/history flow, health endpoint, and Wan/fal adapter are in place. Real GPU generation remains disabled until a dedicated provider credential is configured.

## MVP
- Text-to-video and image-to-video UI
- Model, duration, aspect ratio and quality controls
- Local generation queue UX
- Provider-neutral `VideoEngine` contract
- `POST /api/generate` validation and job creation
- `GET /api/generate/[id]` job polling
- `GET /api/health` deployment readiness check
- Wan 2.2 adapter through fal.ai
- Clean white responsive studio UI

## Architecture
Next.js frontend → generation API → VideoEngine adapter → GPU/API provider → video result URL.

The current development adapter does not spend external GPU/API credits.

## Deployment
Vercel project: `ai-room`

Canonical AI ROOM URL:
`https://ai-room-ai-team-chat.vercel.app`

Current GitHub repository:
`harisnukurniawan-star/Free-Repo`

Repository rename target:
`harisnukurniawan-star/ai-room`

Working branch:
`feature/ai-room-video-mvp`

Safe default environment:
```env
AI_ROOM_VIDEO_PROVIDER=development
```

Production video generation requires:
```env
AI_ROOM_VIDEO_PROVIDER=fal
AI_ROOM_FAL_KEY=<server-side secret>
```

Keep `AI_ROOM_FAL_KEY` server-side and never expose it to the browser.

## Health check
Use `GET /api/health` after deployment. Development mode reports ready without calling an external GPU provider. In fal mode, readiness requires `AI_ROOM_FAL_KEY`.

## Run
```bash
npm install
npm run dev
```

## Safety boundary
AI ROOM is intended for adult users and lawful content. Production adapters must reject sexual content involving minors or age-ambiguous subjects and non-consensual sexual depictions of real people.
