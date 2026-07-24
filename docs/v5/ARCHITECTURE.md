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

## 주요 API 흐름

1. `/auth/google`
   로그인 시작
2. `/api/providers`
   현재 세션 기준 provider 연결 상태 조회
3. `/api/generate-draft`
   `sourceMode`, `sourceText`, `aiProvider`, `aiApiKey` 기반 초안 생성
4. `/api/export-hwpx`
   HWPX build + validation + generated file registration
5. `/api/generated`
   현재 세션의 최근 생성 파일 목록 조회
6. `/api/generated/:fileId`
   현재 세션이 소유한 파일만 다운로드

## 보안 경계

- API key는 세션별 저장
- 다운로드는 세션 소유권 확인 후 허용
- mock login은 development 전용
- 전역 `process.env`를 런타임 사용자 키 저장소로 사용하지 않음
