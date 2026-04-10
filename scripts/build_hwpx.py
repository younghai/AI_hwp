from __future__ import annotations

import argparse
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OFFICE_DIR = SCRIPT_DIR / "office"
REPO_ROOT = SCRIPT_DIR.parent
if str(OFFICE_DIR) not in sys.path:
    sys.path.insert(0, str(OFFICE_DIR))

from hwpx_utils import pack_hwpx, unpack_hwpx


NAMESPACES = {
    "opf": "http://www.idpf.org/2007/opf/",
    "hp": "http://www.hancom.co.kr/hwpml/2011/paragraph",
}

for prefix, uri in {
    "ha": "http://www.hancom.co.kr/hwpml/2011/app",
    "hp": "http://www.hancom.co.kr/hwpml/2011/paragraph",
    "hp10": "http://www.hancom.co.kr/hwpml/2016/paragraph",
    "hs": "http://www.hancom.co.kr/hwpml/2011/section",
    "hc": "http://www.hancom.co.kr/hwpml/2011/core",
    "hh": "http://www.hancom.co.kr/hwpml/2011/head",
    "hhs": "http://www.hancom.co.kr/hwpml/2011/history",
    "hm": "http://www.hancom.co.kr/hwpml/2011/master-page",
    "hpf": "http://www.hancom.co.kr/schema/2011/hpf",
    "dc": "http://purl.org/dc/elements/1.1/",
    "opf": "http://www.idpf.org/2007/opf/",
    "ooxmlchart": "http://www.hancom.co.kr/hwpml/2016/ooxmlchart",
    "epub": "http://www.idpf.org/2007/ops",
    "config": "urn:oasis:names:tc:opendocument:xmlns:config:1.0",
}.items():
    ET.register_namespace(prefix, uri)


TEMPLATES = {
    "gonmun": {
        "path": (REPO_ROOT / "templates" / "gonmun.hwpx").resolve(),
        "default_title": "원본 공문 스타일을 유지하는 AI 문서 생성 서비스 제안서",
        "default_toc": [
            "서비스 추진 배경",
            "원본 문서 분석 범위",
            "스타일 유지형 내용 치환 방식",
            "검수 및 승인 체계",
            "시범 운영 일정",
        ],
    }
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a demo HWPX document from a template.")
    parser.add_argument("--template", default="gonmun", choices=sorted(TEMPLATES))
    parser.add_argument("--template-file", help="Path to an uploaded .hwpx file to use as the source template")
    parser.add_argument("--output", required=True, help="Output .hwpx path")
    parser.add_argument("--title", help="Document title")
    parser.add_argument("--toc", help="Pipe-separated or newline-separated table of contents")
    parser.add_argument("--source-document", default="document.hwpx", help="Name of the source document")
    return parser.parse_args()


def normalize_toc(raw_toc: str | None, template_name: str) -> list[str]:
    if raw_toc:
        items = [item.strip() for item in raw_toc.replace("|", "\n").splitlines() if item.strip()]
    else:
        items = list(TEMPLATES[template_name]["default_toc"])

    while len(items) < 5:
        items.append(f"추가 섹션 {len(items) + 1}")

    return items[:5]


def build_text_plan(title: str, toc: list[str], source_document: str) -> list[str]:
    now_label = datetime.now().strftime("%Y.%m.%d")
    short_title = title.replace("제안서", "").strip()

    return [
        title,
        "AI 스타일 치환 초안",
        f"<원본문서 : {source_document}, {now_label}>",
        toc[0],
        "기존 HWPX의 문단 구조를 유지한 채 새 제목과 목차를 반영합니다.",
        f"{short_title}의 목적과 기대효과를 한 페이지 요약 형태로 정리합니다.",
        toc[1],
        "원본 XML에서 비어있지 않은 텍스트 노드를 순서대로 분석합니다.",
        "표, 문단, 글꼴 ID는 유지하고 본문 텍스트만 교체합니다.",
        "목차에 맞는 섹션 문장을 생성해 템플릿 위치에 다시 삽입합니다.",
        toc[2],
        "원본 양식의 승인 흐름과 페이지 구성을 그대로 재사용합니다.",
        "섹션별 요약 문단과 핵심 bullet을 자동 생성합니다.",
        "검토용 수정 포인트를 별도 첨부 없이 문서 내부에 반영합니다.",
        toc[3],
        "원본 분석 : 완료",
        "스타일 추출 : 완료",
        "본문 치환 : 자동 생성",
        toc[4],
        "승인 전 제목, 목차, 일정 문구를 최종 확인합니다.",
        "필요 시 원본 부서명과 날짜만 후속 수정합니다.",
        "편집 완료 후 HWPX로 재패키징해 배포합니다.",
        "붙임1 참고",
        "붙임",
        f"{short_title} 일정",
        "개요",
        "구조 유지",
        "일정",
    ]


def apply_text_replacements(section_xml: Path, replacements: list[str]) -> None:
    tree = ET.parse(section_xml)
    root = tree.getroot()
    text_nodes = [node for node in root.findall(".//hp:t", NAMESPACES) if node.text and node.text.strip()]

    if len(text_nodes) < len(replacements):
        raise SystemExit(
            f"Template does not contain enough text nodes for replacement: {len(text_nodes)} < {len(replacements)}"
        )

    for index, replacement in enumerate(replacements):
        text_nodes[index].text = replacement

    tree.write(section_xml, encoding="utf-8", xml_declaration=True)


def update_preview(preview_path: Path, title: str, toc: list[str], source_document: str) -> None:
    lines = [
        "<>",
        f"<{title}>",
        f"<원본: {source_document}>",
        "",
        "개요",
        "원본 문서 스타일과 섹션 구조를 유지하면서 새 제목과 목차를 반영한 데모 문서입니다.",
        "",
        "목차",
    ]
    lines.extend(f"{index + 1}. {item}" for index, item in enumerate(toc))
    lines.extend(
        [
            "",
            "프로세스",
            "1. HWPX 압축 해제",
            "2. XML 텍스트 노드 치환",
            "3. HWPX 재패키징",
        ]
    )
    preview_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def update_metadata(content_hpf: Path, title: str) -> None:
    tree = ET.parse(content_hpf)
    root = tree.getroot()
    title_node = root.find(".//opf:title", NAMESPACES)
    if title_node is not None:
        title_node.text = title
    tree.write(content_hpf, encoding="utf-8", xml_declaration=True)


def main() -> None:
    args = parse_args()
    template = TEMPLATES[args.template]
    template_path = Path(args.template_file).expanduser().resolve() if args.template_file else template["path"]
    title = args.title or template["default_title"]
    toc = normalize_toc(args.toc, args.template)
    output = Path(args.output).expanduser().resolve()

    if not template_path.exists():
        raise SystemExit(f"Template file not found: {template_path}")

    with tempfile.TemporaryDirectory(prefix="hwpx-build-") as temp_dir:
        working_dir = Path(temp_dir)
        unpack_hwpx(template_path, working_dir)

        replacements = build_text_plan(title, toc, args.source_document)
        apply_text_replacements(working_dir / "Contents" / "section0.xml", replacements)
        update_preview(working_dir / "Preview" / "PrvText.txt", title, toc, args.source_document)
        update_metadata(working_dir / "Contents" / "content.hpf", title)

        pack_hwpx(working_dir, output)

    print(f"Built {output}")


if __name__ == "__main__":
    main()
