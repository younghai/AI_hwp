# v5 Setup

## 요구 사항

- Node.js 24.x
- npm
- Python 3.x

## 설치

```bash
cd v5
npm install
cp server/.env.example server/.env
```

필요 시 `server/.env`에 아래 값을 채운다.

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- provider OAuth client credentials

API key 직접 입력 방식만 쓸 경우 provider API key는 UI에서 세션별로 입력 가능하다.

## 실행

```bash
cd v5
npm run dev
```

기본 포트:

- Client: `5194`
- Server: `8794`

자동 로그인 데모 모드:

```bash
cd v5
npm run dev:auto
```

자동 로그인 포트:

- Client: `5195`
- Server: `8795`

## 빌드 검증

```bash
cd v5
npm run build
```

서버 문법 점검 예시:

```bash
node --check v5/server/index.js
```
