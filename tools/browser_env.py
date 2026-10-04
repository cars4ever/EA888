#!/usr/bin/env python3
"""Resolves the headless Chromium the dev tools launch.

The tools used to hard-code /usr/bin/chromium, which only exists on the original
host. Order: $EA888_CHROMIUM, Playwright's own download, then the usual system
paths. Returns None when Playwright should pick its bundled browser itself.
"""
import os
import pathlib
import shutil

SYSTEM_PATHS = ('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable', '/snap/bin/chromium')


def chromium_executable(playwright=None):
    override = os.environ.get('EA888_CHROMIUM')
    if override:
        if not pathlib.Path(override).exists():
            raise SystemExit(f'EA888_CHROMIUM={override} does not exist')
        return override
    if playwright is not None:
        try:
            path = playwright.chromium.executable_path
            if path and pathlib.Path(path).exists():
                return None      # let Playwright launch its own build
        except Exception:
            pass
    for path in SYSTEM_PATHS:
        if pathlib.Path(path).exists():
            return path
    found = shutil.which('chromium') or shutil.which('google-chrome')
    if found:
        return found
    raise SystemExit('no Chromium found: set EA888_CHROMIUM or run "python3 -m playwright install chromium"')


def launch_kwargs(playwright, args):
    """Keyword arguments for p.chromium.launch(...) with the resolved browser."""
    exe = chromium_executable(playwright)
    kwargs = {'headless': True, 'args': list(args)}
    if exe:
        kwargs['executable_path'] = exe
    return kwargs
