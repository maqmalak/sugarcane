"""Code 128 (set B) barcodes as inline SVG — for printed indents now and CPR / token slips later. No dependency: the
bench has no barcode library, and wkhtmltopdf renders inline SVG."""

from __future__ import annotations

from xml.sax.saxutils import escape

# bar/space widths of the 107 Code 128 symbols (0–102 data, 103–105 start A/B/C, 106 stop)
PATTERNS = (
	"212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212",
	"112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
	"311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321",
	"112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
	"313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
	"314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
	"122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212",
	"124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
	"114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
)
START_B, STOP = 104, 106


def code128_values(text: str) -> list[int]:
	"""Symbol values for `text` in set B, with the start, checksum and stop symbols."""
	if any(not 32 <= ord(c) <= 126 for c in text):
		raise ValueError("Code 128 B covers printable ASCII only")
	data = [ord(c) - 32 for c in text]
	check = (START_B + sum(i * v for i, v in enumerate(data, start=1))) % 103
	return [START_B, *data, check, STOP]


def modules(text: str) -> list[int]:
	"""Alternating bar / space widths (in modules), starting with a bar."""
	return [int(w) for v in code128_values(text) for w in PATTERNS[v]]


def svg(text: str, module: float = 1.4, height: float = 42, quiet: int = 10, show_text: bool = True) -> str:
	widths = modules(text)
	x, rects = quiet * module, []
	for i, w in enumerate(widths):
		if i % 2 == 0:
			rects.append(f'<rect x="{x:.2f}" y="0" width="{w * module:.2f}" height="{height}"/>')
		x += w * module
	total = x + quiet * module
	label_h = 12 if show_text else 0
	label = (f'<text x="{total / 2:.2f}" y="{height + 10}" font-family="monospace" font-size="10" text-anchor="middle">'
		f'{escape(text)}</text>') if show_text else ""
	return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{total:.2f}" height="{height + label_h}" '
		f'viewBox="0 0 {total:.2f} {height + label_h}"><rect width="100%" height="100%" fill="#fff"/>'
		f'<g fill="#000">{"".join(rects)}</g>{label}</svg>')
