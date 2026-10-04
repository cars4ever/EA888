#!/usr/bin/env python3
"""Read and write the RAW_CATEGORIES parts table that sim.js carries as one JSON line.

The table is a single-line JSON literal inside src/assets/sim.js, which makes hand-editing it by text
replacement error-prone (one wrong comma takes the whole game down). This module parses it, hands it over as
Python data, and writes it back in exactly the same shape.

  from tools.parts_edit import load, save
  cats = load(); cats['block']['items'].append({...}); save(cats)

Every item inherits the defaults of the first item in its category for any field it leaves out, so a new item
only has to state what makes it different.
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from collections import OrderedDict

SIM = Path(__file__).resolve().parents[1] / 'src' / 'assets' / 'sim.js'
PREFIX = '  const RAW_CATEGORIES = '


def _line(text: str) -> int:
    for i, l in enumerate(text.splitlines()):
        if l.startswith(PREFIX):
            return i
    raise SystemExit('RAW_CATEGORIES line not found in sim.js')


def load():
    """The categories as an ordered dict keyed by category id."""
    text = SIM.read_text()
    lines = text.splitlines()
    raw = lines[_line(text)][len(PREFIX):].rstrip()
    assert raw.endswith(';'), 'unexpected end of the RAW_CATEGORIES line'
    cats = json.loads(raw[:-1])
    return OrderedDict((c['id'], c) for c in cats)


def save(cats) -> None:
    text = SIM.read_text()
    lines = text.splitlines(keepends=True)
    i = _line(text)
    body = json.dumps(list(cats.values()), ensure_ascii=False, separators=(',', ':'))
    lines[i] = f'{PREFIX}{body};\n'
    SIM.write_text(''.join(lines))


def template(cats, cat_id: str) -> dict:
    """The field set of a category, taken from its first item: the defaults a new item starts from."""
    return dict(cats[cat_id]['items'][0])


def add(cats, cat_id: str, item: dict, after: str | None = None) -> dict:
    """Add an item to a category, filling every unspecified field from the category's first item."""
    items = cats[cat_id]['items']
    if any(i['id'] == item['id'] for i in items):
        raise SystemExit(f'{cat_id}: item {item["id"]} already exists')
    full = template(cats, cat_id)
    full.update(item)
    if after is None:
        items.append(full)
    else:
        idx = next(n for n, i in enumerate(items) if i['id'] == after)
        items.insert(idx + 1, full)
    return full


if __name__ == '__main__':
    import sys
    cats = load()
    if len(sys.argv) > 1:
        cat = cats[sys.argv[1]]
        keys = sys.argv[2:] or ['id', 'name', 'price']
        for it in cat['items']:
            print('  '.join(f'{k}={it.get(k)}' for k in keys))
    else:
        for cid, c in cats.items():
            print(f'{cid:14} {len(c["items"]):2} items   {c["label"]}')
