# AI HWPX Demo

HWPX 원본 문서를 업로드한 뒤 AI에 제목과 목차를 입력하면, 기존 한글 문서의 스타일과 구조를 유지한 채 새 문서를 생성하는 데모 서비스입니다.

## 주요 기능

- `.hwpx` 원본 문서 업로드
- 문서 유형 예시 버튼 제공
  - 회의록
  - 사업계획서
  - 제안서
  - RFP
- 제목과 목차를 기반으로 결과물 미리보기 제공
- 실제 `.hwpx` 파일 생성 및 다운로드
- HWPX unzip/xml 치환/repack 워크플로 내장

## 프로젝트 구조

```text
.
├── app.js
├── generate.php
├── index.html
├── styles.css
├── scripts/
│   ├── build_hwpx.py
│   └── office/
│       ├── hwpx_utils.py
│       ├── pack.py
│       └── unpack.py
├── templates/
│   └── gonmun.hwpx
└── docs/
    ├── SERVICE_OVERVIEW.md
    ├── SETUP.md
    └── USAGE.md
```

## 빠른 실행

```bash
php -S 127.0.0.1:8000
```

브라우저에서 `http://127.0.0.1:8000` 을 열면 됩니다.

## 문서

- [서비스 소개](./docs/SERVICE_OVERVIEW.md)
- [실행 방법](./docs/SETUP.md)
- [사용 방법](./docs/USAGE.md)
