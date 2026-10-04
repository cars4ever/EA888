#!/usr/bin/env python3
"""One-off migration: split src/assets/styles.css into src/styles/app.css (app shell + pages) and
src/styles/race.css (fullscreen burnout/stage/race scenes). A rule goes to race.css when every selector in it
references a race-scene class or the race root; @media/@supports blocks are split rule by rule.
Kept in the repo to document how the split was made."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RACE = re.compile(r'\.v(?:7|8|9|10|12|13)-|\.ea-flame|#race-game-root|\.race-game-open|#ea-stage|#v1[0-3]-|#v[789]-')


def blocks(css: str):
    """Yield (prelude, body_or_None, raw) for top-level statements, handling comments and strings."""
    i, n = 0, len(css)
    start = 0
    while i < n:
        c = css[i]
        if css.startswith('/*', i):
            j = css.find('*/', i + 2)
            i = n if j < 0 else j + 2
            continue
        if c in '"\'':
            j = i + 1
            while j < n and css[j] != c:
                j += 2 if css[j] == '\\' else 1
            i = j + 1
            continue
        if c == ';':  # @import / @charset style statement
            yield css[start:i + 1], None
            i += 1
            start = i
            continue
        if c == '{':
            depth, j = 1, i + 1
            while j < n and depth:
                if css.startswith('/*', j):
                    k = css.find('*/', j + 2)
                    j = n if k < 0 else k + 2
                    continue
                if css[j] in '"\'':
                    q = css[j]
                    j += 1
                    while j < n and css[j] != q:
                        j += 2 if css[j] == '\\' else 1
                    j += 1
                    continue
                if css[j] == '{':
                    depth += 1
                elif css[j] == '}':
                    depth -= 1
                j += 1
            yield css[start:i], css[i + 1:j - 1]
            i = j
            start = i
            continue
        i += 1
    tail = css[start:].strip()
    if tail:
        yield tail, None


def strip_comments(s: str) -> str:
    return re.sub(r'/\*.*?\*/', '', s, flags=re.S)


def is_race(prelude: str) -> bool:
    sels = [x.strip() for x in strip_comments(prelude).split(',') if x.strip()]
    return bool(sels) and all(RACE.search(s) for s in sels)


def split(css: str) -> tuple[list[str], list[str]]:
    app, race = [], []
    for prelude, body in blocks(css):
        head = strip_comments(prelude).strip()
        if body is None:
            app.append(prelude.strip())
            continue
        if head.startswith('@media') or head.startswith('@supports'):
            a, r = split(body)
            wrap = lambda parts: f'{head} {{\n  ' + '\n  '.join(parts) + '\n}'
            if a:
                app.append(wrap(a))
            if r:
                race.append(wrap(r))
            continue
        rule = f'{prelude.strip()} {{{body}}}'
        if head.startswith('@keyframes'):
            name = head.split()[1]
            (race if re.match(r'(v(?:7|8|9|10|12|13)|ea-flame)', name) else app).append(rule)
        elif head.startswith('@'):
            app.append(rule)
        else:
            (race if is_race(prelude) else app).append(rule)
    return app, race


def main() -> None:
    src = ROOT / 'src' / 'assets' / 'styles.css'
    app, race = split(src.read_text(encoding='utf-8'))
    out = ROOT / 'src' / 'styles'
    out.mkdir(exist_ok=True)
    (out / 'app.css').write_text('/* App shell and pages. */\n' + '\n'.join(app) + '\n', encoding='utf-8')
    (out / 'race.css').write_text('/* Fullscreen burnout / stage / race scenes (rebuilt in phase 3). */\n' + '\n'.join(race) + '\n', encoding='utf-8')
    print(f'app rules: {len(app)}, race rules: {len(race)}', file=sys.stderr)


if __name__ == '__main__':
    main()
