# v5 Service Overview

## 개요

`v5`는 HWP/HWPX 문서를 업로드해 내용을 파싱하고, AI 초안을 생성한 뒤, 최종 `.hwpx` 파일로 다시 내보내는 localhost 중심 문서 자동화 앱이다.

`v4`에서 드러난 문제였던 전역 `process.env` 기반 키 오염, 메모리 기반 세션, 공개 정적 다운로드 경로를 줄이는 방향으로 정리되어 있다.

## 현재 가능한 범위

- Google 로그인 후 세션 기반 사용
- 세션별 AI provider key 저장
- HWP/HWPX 업로드 후 초안 생성
- HWPX 내보내기 및 검증
- 최근 생성 문서 목록 확인
- 세션 소유 문서만 다운로드

## 현재 운영 전제

- 단일 호스트
- localhost 또는 소규모 내부 데모
- Node 24.x
- Python 실행 환경 존재
- rhwp 미리보기 실행 가능 환경

## v4 대비 차이

- 세션 저장소: 메모리 -> SQLite
- 생성 파일 레지스트리: 메모리 -> SQLite
- 생성 파일 저장 위치: temp-only -> `v5/data/generated`
- 다운로드 방식: 정적 노출 금지 + 세션 소유권 확인

## 아직 남아 있는 제약

- OAuth state는 아직 메모리 기반
- Node 내장 SQLite는 experimental warning이 있음
- 멀티 인스턴스 운영 전제는 아님
