# v5 Operations

## 저장 위치

- SQLite DB: `v5/data/app.db`
- 생성 파일: `v5/data/generated/`

## 세션 동작

- 로그인 후 세션 쿠키 발급
- 세션별 provider secret 저장
- 로그아웃 시 세션 데이터와 세션 소유 생성 파일 정리

## Cleanup

앱 시작 시:

- DB 초기화
- 만료 세션/만료 파일 cleanup 1회 실행

런타임 중:

- 10분 주기 cleanup

정리 대상:

- 만료 세션
- 만료 OAuth state
- 만료 generated file metadata
- 만료 generated file 실제 파일

## 관측성

- 구조화 로그(pino, JSON): 요청/응답은 `pino-http`가 자동 기록하고
  `/api/health` 폴링은 노이즈라 제외. `LOG_LEVEL` 환경변수로 레벨 조절
  (기본 info)
- `/api/metrics`: `ai_draft`(AI 초안 생성), `hwpx_build`(HWPX 빌드) 각각의
  성공/실패 건수와 평균 응답시간(ms)을 메모리 스냅샷으로 제공. 재시작하면
  초기화됨(영구 저장 아님)

## 장애 포인트

1. Python 미설치
   spawn error로 즉시 실패

2. HWPX validator 스크립트 누락
   native validator note 반환

3. SQLite experimental warning
   `node:sqlite` 가 아직 experimental이라 기동 시 경고 출력 (Node 22.5+ 공통,
   Node 24 한정 아님)

4. 서버 재시작
   세션/생성 메타데이터/OAuth state 모두 SQLite에 있어 재시작에도 유지된다.
   단, `googleAuth.js`의 상태(state) 맵은 여전히 인메모리라 Google 로그인
   콜백 도중 재시작하면 그 요청만 끊긴다 (범용 provider OAuth인
   `/auth/:provider` 쪽은 `oauth_states` 테이블 기반이라 재시작에 영향받지
   않음 — Google 로그인 전용 코드 경로만 아직 인메모리)

## 다음 단계 권장

- `googleAuth.js`의 인메모리 state map도 `oauth_states` 테이블로 통합
  (범용 provider OAuth와 동일하게)
- generated file 삭제 API 추가
- 최근 생성 문서 목록에 만료 상태 표시
- `/api/metrics`를 재시작에도 유지되는 형태로 확장(현재는 인메모리 스냅샷)
