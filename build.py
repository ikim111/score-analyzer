# src/ 의 조각을 합쳐 index.html(배포본)을 만든다.  사용: python3 build.py
from pathlib import Path
root = Path(__file__).parent
s = lambda p: (root / "src" / p).read_text(encoding="utf-8")
out = s("page_head.html") + s("page_body.html").replace("/*ANALYZE*/", s("analyze.js")).replace("/*COMPARE*/", s("compare.js"))
(root / "index.html").write_text(out, encoding="utf-8")
print(f"index.html 생성 ({len(out):,}자)")
