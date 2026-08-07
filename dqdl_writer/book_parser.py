"""
书籍解析器：从 txt 文件中按章节分割。
支持 GBK 编码的中文小说 txt。
"""
import re
import os
from config import BOOKS, BOOKS_DIR, CHAPTER_MAX_CHARS


def parse_chapters(book_name: str, max_chapters: int = None) -> list[dict]:
    """
    解析 txt 小说，按章节分割。
    返回 [{chapter: 1, title: "xxx", text: "xxx"}, ...]

    章节标题匹配：支持 "第X章" / "第一章" 两种格式。
    """
    book = BOOKS.get(book_name)
    if not book:
        raise ValueError(f"未知书籍: {book_name}")

    filepath = os.path.join(BOOKS_DIR, book["file"])
    encoding = book["encoding"]

    with open(filepath, encoding=encoding, errors='replace') as f:
        full_text = f.read()

    # 章节正则：匹配 "第1章" / "第一章" / "第123回" 等
    chapter_pattern = re.compile(
        r'^(第[一二三四五六七八九十百千零\d]+[章回节卷].*)$',
        re.MULTILINE
    )

    matches = list(chapter_pattern.finditer(full_text))
    if len(matches) == 0:
        # 无章节标记，按固定长度切分
        print(f"  [{book_name}] 未检测到章节标记，按 {CHAPTER_MAX_CHARS} 字切分")
        chunks = []
        for i in range(0, len(full_text), CHAPTER_MAX_CHARS):
            chunks.append({
                "chapter": len(chunks) + 1,
                "title": f"段落{len(chunks) + 1}",
                "text": full_text[i:i + CHAPTER_MAX_CHARS],
            })
        return chunks[:max_chapters] if max_chapters else chunks

    chapters = []
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        title = match.group(1).strip()
        text = full_text[start:end].strip()

        # 截断超长章节
        if len(text) > CHAPTER_MAX_CHARS:
            text = text[:CHAPTER_MAX_CHARS] + "...（截断）"

        chapters.append({
            "chapter": i + 1,
            "title": title,
            "text": text,
        })

    if max_chapters:
        chapters = chapters[:max_chapters]

    print(f"  [{book_name}] 解析到 {len(chapters)} 章（全书约 {len(matches)} 章）")
    return chapters


if __name__ == "__main__":
    # 快速测试
    for book_name in BOOKS:
        print(f"\n=== {book_name} ===")
        chapters = parse_chapters(book_name, max_chapters=2)
        for ch in chapters:
            print(f"  第{ch['chapter']}章: {ch['title']} ({len(ch['text'])}字)")
