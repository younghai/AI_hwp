# specs/font-metrics

Polaris MCFG (v0.2.3) `mcfg extract` 출력 형식 (schemaVersion 1) 의
폰트 메트릭 spec 캐시.

본 디렉토리의 파일은 **fixture(데모/스켈레톤)** 입니다 — 한컴 폰트 EULA
미검토 상태이므로, KoPub Batang / Noto Sans KR 등 OFL 폰트 메트릭만
포함합니다. 한컴 EULA 통과 시 `scripts/extract-font-metrics.sh` 또는
`mcfg extract <hancom-font>.ttf -o <name>.json` 으로 자동 갱신 가능.

본 spec 은 `server/services/mcfgValidator.js` 가 빌드된 HWPX 의
`Contents/header.xml` 안 `<hh:fontFace>` 와 비교할 때 사용됩니다.
매핑은 `specs/font-metrics-mapping.json` 참조.
