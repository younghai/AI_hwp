# 실행 방법

## 요구 사항

- PHP 8 이상
- Python 3.9 이상

## 로컬 실행

프로젝트 루트에서 아래 명령을 실행합니다.

```bash
php -S 127.0.0.1:8000
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:8000
```

## 핵심 스크립트

문서 생성:

```bash
python3 scripts/build_hwpx.py --template gonmun --output result.hwpx
```

압축 해제:

```bash
python3 scripts/office/unpack.py document.hwpx ./unpacked/
```

재패키징:

```bash
python3 scripts/office/pack.py ./unpacked/ edited.hwpx
```

## 참고

- 기본 템플릿은 `templates/gonmun.hwpx` 를 사용합니다.
- 브라우저 UI의 실행 버튼은 내부적으로 `generate.php` 를 호출해 실제 파일을 만듭니다.
