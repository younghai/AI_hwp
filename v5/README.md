# v5 — AI Document Studio (HWP / HWPX Automation)

`v5/`는 `v4`의 현재 구조를 기준으로 분리한 다음 단계 작업본이다.  
핵심 차이는 세션, OAuth state, 생성 파일 메타데이터를 메모리 대신 로컬 SQLite로 유지하고, 생성물도 `v5/data/generated/`로 관리한다는 점이다.

## Current Shape

- React + Vite client
- Express server
- SQLite-backed session and generated-file registry
- Local file storage for generated `.hwpx`
- Session-protected download endpoints

## Quick Start

```bash
cd v5
npm install
cp server/.env.example server/.env
npm run dev
```

- Client: `http://127.0.0.1:5194`
- Server: `http://127.0.0.1:8794`
- Auto-login demo lane: `npm run dev:auto`
  - Client: `http://127.0.0.1:5195`
  - Server: `http://127.0.0.1:8795`

## Directory Highlights

```text
v5/
├── client/              # React + Vite
├── server/              # Express API
├── shared/              # client/server shared helpers
├── scripts/             # Python HWPX build + validators
├── tools/               # smoke test / verification tools
├── specs/               # document validation specs
├── templates/           # base templates and sample files
├── docs/                # carried-over project docs + ADR
└── data/                # runtime SQLite db + generated files
```

## Runtime Notes

- Sessions are stored in `v5/data/app.db`.
- Generated files are stored in `v5/data/generated/`.
- `/api/generated/:fileId` requires the owning session.
- `Google mock login` remains development-only.

## Current Limitations

- `googleAuth` state is still in-memory, not SQLite-backed.
- Runtime uses Node `node:sqlite`, which works on Node 24 but still emits an experimental warning.
- The app is suitable for localhost or single-host demo use, not multi-instance production.

## Related Docs

- Root docs index: [../docs/v5/README.md](../docs/v5/README.md)
- Local design/decision trail: [./docs/adr](./docs/adr)
- Project rules/history: [./CLAUDE.md](./CLAUDE.md)
