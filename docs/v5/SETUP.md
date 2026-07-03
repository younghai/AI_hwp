# v5 Setup

## 요구 사항

- Node.js 22.5 이상 (`node:sqlite` 내장 모듈 요구사항 — 24.x 아니어도 됨)
- pnpm (`packageManager` 필드 기준 `pnpm@10.32.1`)
- Python 3.x

## 설치

```bash
cd v5
pnpm install
cp server/.env.example server/.env
```

> `pnpm-workspace.yaml`이 workspace 루트(`v5/`)에 있어야 `pnpm install`이
> client/server 의존성을 실제로 설치한다. `package.json`의 npm 스타일
> `workspaces` 필드는 pnpm이 읽지 않으며, 없어도 에러 없이 조용히 스킵된다.

필요 시 `server/.env`에 아래 값을 채운다.

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — 비워두면 development 모드에서
  mock 로그인으로 동작

AI provider API key는 `.env`가 아니라 로그인 후 UI(우측 상단 '프로바이더
설정')에서 세션별로 입력한다 — 세션의 SQLite 레코드에 저장되며, 서버는
`ANTHROPIC_API_KEY` 같은 환경변수를 직접 읽지 않는다.

## 실행

```bash
cd v5
pnpm run dev
```

기본 포트:

- Client: `5194`
- Server: `8794`

자동 로그인 데모 모드:

```bash
cd v5
pnpm run dev:auto
```

자동 로그인 포트:

- Client: `5195`
- Server: `8795`

## 빌드 검증

```bash
cd v5
pnpm --dir client build
pnpm --dir client test
```

서버 문법 점검 예시:

```bash
node --check v5/server/index.js
```

## E2E 검증

dev 서버가 기동 중인 상태에서:

```bash
bash v5/tools/smoke-test.sh      # 업로드~다운로드 전체 흐름 + wasm 서빙 확인
bash v5/testdata/run-golden.sh   # 마커/템플릿유출/검증에러 기준 골든 케이스
```

두 스크립트 모두 내부적으로 `GET /auth/google/mock`으로 세션을 먼저 확보한
뒤 나머지 요청에 그 쿠키를 실어 보낸다 (v5는 `/api/health`를 제외한 모든
`/api/*`가 로그인 세션을 요구함).
