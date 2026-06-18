"""检查 docx 中 WB-050, WB-100, WB-200, WB-300 的原始数据"""
from docx import Document
import re

doc = Document('../rag/魔兽图鉴.docx')

for target in ['WB-050', 'WB-100', 'WB-200', 'WB-300']:
    print(f'===== {target} =====')
    capture = False
    for p in doc.paragraphs:
        t = p.text.strip()
        if t.startswith(f'【ID】{target}'):
            capture = True
        if capture:
            if t.startswith('---') or (t.startswith('【ID】WB-') and not t.startswith(f'【ID】{target}')):
                break
            print(t[:150])
    print()
