# v2 Local Demo

v2는 v1 실험판을 유지한 채, `rhwp` 기반으로 `hwp`와 `hwpx`를 모두 업로드해 로컬 브라우저에서 파싱하고, 그 내용을 바탕으로 새 문서 초안을 만드는 localhost 데모입니다.

## 핵심 차이

- `hwp` / `hwpx` 동시 업로드
- `rhwp` 기반 페이지 파싱 및 SVG 미리보기
- 하드코딩 예시 버튼 대신 업로드 문서 기준 초안 생성
- 별도 Docker 없이 localhost 실행
- `.hwpx` 업로드 시 업로드한 양식을 템플릿으로 재사용
- `.hwp` 업로드 시 업로드 본문을 분석하고 기본 HWPX 양식으로 새 문서 생성

## 실행

```bash
cd v2
npm install
npm run dev
```

- client: `http://localhost:5188`
- server: `http://localhost:8788`

## 참고

- 문서 파싱/렌더링: [`rhwp`](https://github.com/edwardkim/rhwp)
- 결과 파일 생성: 상위 폴더의 `scripts/build_hwpx.py`

