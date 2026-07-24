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

## 장애 포인트

1. Python 미설치
   spawn error로 즉시 실패

2. HWPX validator 스크립트 누락
   native validator note 반환

3. SQLite experimental warning
   Node 24 `node:sqlite` 특성으로 경고 출력 가능

4. 서버 재시작
   세션/생성 메타데이터는 유지되지만, Google OAuth state는 메모리 기반이라 로그인 callback 도중 재시작하면 끊길 수 있음

## 다음 단계 권장

- Google OAuth state도 SQLite로 이동
- generated file 삭제 API 추가
- 최근 생성 문서 목록에 만료 상태 표시
- `v5` 단독 배포용 README/boot script 정리
