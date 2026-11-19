"""Write design/tokens.css from design/tokens.json (the Larch design system's tokens).

    python3 scripts/tokens_css.py

Light values go on :root; dark values under prefers-color-scheme (unless data-theme="light")
and again under [data-theme="dark"], so the theme toggle wins both ways. Colour aliases
("{name}") resolve per theme. tokens.json comes from the Larch design book.
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
OTHER = ("spacing", "radius", "layout", "network", "zIndex", "opacity")


def main() -> None:
    t = json.loads((HERE / "design" / "tokens.json").read_text())
    first = t["color"]["themes"][0]["id"]
    colours = {c["name"]: c["value"] for c in t["color"]["tokens"]}

    def value(name: str, theme: str) -> str:
        v = colours[name]
        v = v if isinstance(v, str) else v.get(theme, v[first])
        return value(v[1:-1], theme) if v.startswith("{") else v

    def block(theme: str, indent: str) -> str:
        lines = [f"{indent}--{n}: {value(n, theme)};" for n in colours]
        for s in t.get("shadow", {}).get("tokens", []):
            v = s["value"] if isinstance(s["value"], str) else s["value"].get(theme, s["value"][first])
            lines.append(f"{indent}--{s['name']}: {v};")
        return "\n".join(lines)

    other = [f"  --{x['name']}: {x['value']};" for k in OTHER for x in t.get(k, {}).get("tokens", [])]
    fonts = [f"  --font-{k}: {v};" for k, v in t["type"]["families"].items()]
    css = f"""/* {t['name']} — generated from tokens.json */
:root {{
  color-scheme: light;
{block('light', '  ')}
{chr(10).join(other)}
{chr(10).join(fonts)}
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    color-scheme: dark;
{block('dark', '    ')}
  }}
}}
:root[data-theme="dark"] {{
  color-scheme: dark;
{block('dark', '  ')}
}}
"""
    (HERE / "design" / "tokens.css").write_text(css)
    print(f"wrote design/tokens.css: {len(colours)} colours, {len(other)} other tokens")


if __name__ == "__main__":
    main()
