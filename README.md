# AI ROOM

Private, multi-engine AI video generation studio.

## MVP
- Text-to-video and image-to-video UI
- Model, duration, aspect ratio and quality controls
- Local generation queue UX
- Provider-neutral `VideoEngine` contract
- `POST /api/generate` validation and job creation
- Wan 2.2 is the planned first production engine

## Architecture
Next.js frontend → generation API → VideoEngine adapter → GPU/API provider → object storage/gallery.

The current development adapter creates jobs without spending external GPU/API credits. Production credentials are intentionally not required yet.

## Run
```bash
npm install
npm run dev
```

## Safety boundary
AI ROOM is intended for adult users and lawful content. Production adapters must reject sexual content involving minors or age-ambiguous subjects and non-consensual sexual depictions of real people.


## Deployment readiness

AI ROOM should be deployed as its own Vercel project linked to `harisnukurniawan-star/Free-Repo`.
Do not reuse unrelated Vercel projects.

Safe default environment:

```env
AI_ROOM_VIDEO_PROVIDER=development
```

To enable real Wan generation only after a dedicated credential is configured:

```env
AI_ROOM_VIDEO_PROVIDER=fal
AI_ROOM_FAL_KEY=<server-side secret>
```

Keep `AI_ROOM_FAL_KEY` server-side and never expose it to the browser.
