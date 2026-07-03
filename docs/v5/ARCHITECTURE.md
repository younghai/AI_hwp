# v5 Architecture

## 런타임 구성

1. Client
   `v5/client`
   React + Vite UI, 업로드/초안/다운로드 흐름 제공

2. Server
   `v5/server`
   Express API, 인증/세션 검증/초안 생성/HWPX export 담당

3. Shared
   `v5/shared`
   문서 유형, draft validation, XML escape 같은 공용 로직

4. Build Scripts
   `v5/scripts`
   Python 기반 HWPX 생성 및 검증 스크립트

5. Runtime Data
   `v5/data/app.db`
   SQLite 데이터베이스

6. Generated Files
   `v5/data/generated/`
   생성된 `.hwpx` 저장 위치

## 저장 모델

SQLite에는 아래 범주의 상태가 저장된다.

- sessions
- session_provider_secrets
- oauth_states
- generated_files
- generated_previews

## 주요 API 흐름

1. `/auth/google`, `/auth/google/mock` (development 전용)
   로그인 시작 / mock 로그인
2. `/api/providers`, `/api/settings`, `/api/test-provider`
   현재 세션 기준 provider 연결 상태 조회 / API 키 저장 / 연결 테스트
3. `/api/generate-draft`
   `sourceMode`, `sourceText`, `aiProvider`, `model`, `aiApiKey`, `docFields`
   기반 초안 생성 — 모델별 실제 usage 토큰이 있으면 그 값으로, 없으면
   문자수 추정치로 비용 계산
4. `/api/regenerate-section`
   초안의 특정 섹션 본문만 다시 생성 (검토·수정 루프)
5. `/api/export-hwpx`
   HWPX build + validation + generated file registration
6. `/api/generated`, `/api/generated/:fileId`, `/api/generated/:fileId/preview`
   현재 세션의 최근 생성 파일 목록 / 세션 소유 파일 다운로드 / 렌더링된
   미리보기 메타데이터 기록
7. `/api/metrics`
   AI 초안 생성·HWPX 빌드의 성공/실패 건수 및 평균 응답시간 스냅샷

## 관측성

- `server/lib/logger.js`: pino 기반 구조화 JSON 로그. `pino-http` 로 요청/
  응답을 자동 기록하되 `/api/health` 폴링은 제외. authorization/cookie/
  apiKey/access_token 필드는 로그에서 자동 redact
- `server/lib/metrics.js`: `ai_draft`, `hwpx_build` 오퍼레이션의 성공/실패
  카운트와 평균 응답시간을 메모리에 집계, `/api/metrics` 로 노출

## 보안 경계

- API key는 세션별 저장
- 다운로드는 세션 소유권 확인 후 허용
- mock login은 development 전용이며, 실제 OAuth 자격증명이 설정돼 있으면
  자동으로 비활성화됨 (개발 모드로 잘못 배포된 경우의 인증 우회 방지)
- 전역 `process.env`를 런타임 사용자 키 저장소로 사용하지 않음
- helmet 보안 헤더 + 전역/AI-라우트별 rate limit 적용
- Python 워커(`build_hwpx.py`)는 defusedxml로 XXE 방어, 실패 시 구조화된
  에러 코드만 클라이언트에 노출(원본 traceback은 서버 로그에만 남음)
