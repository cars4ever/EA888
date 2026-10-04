#!/usr/bin/env python3
"""Patch the tiny resource table so resource 0x7f010000 is a Scirocco launcher icon.

The original shell only contains an unused `string/app_name` resource and a
style.  We repurpose that unused entry as `mipmap/app_icon`: its scalar value is
a TYPE_STRING path to res/mipmap/app_icon.png, exactly how compiled bitmap
resources are represented at runtime.  No Android SDK is needed.
"""
from __future__ import annotations

import argparse
import struct
from pathlib import Path
from typing import Iterable

RES_STRING_POOL_TYPE = 0x0001
UTF8_FLAG = 0x00000100


def u16(data: bytes | bytearray, off: int) -> int:
    return struct.unpack_from('<H', data, off)[0]


def u32(data: bytes | bytearray, off: int) -> int:
    return struct.unpack_from('<I', data, off)[0]


def encode_len8(value: int) -> bytes:
    if value < 0x80:
        return bytes([value])
    if value > 0x7FFF:
        raise ValueError('UTF-8 string length too large')
    return bytes([0x80 | (value >> 7), value & 0x7F])


def build_utf8_string_pool(strings: Iterable[str]) -> bytes:
    values = list(strings)
    offsets: list[int] = []
    payload = bytearray()
    for value in values:
        raw = value.encode('utf-8')
        utf16_len = len(value.encode('utf-16-le')) // 2
        offsets.append(len(payload))
        payload.extend(encode_len8(utf16_len))
        payload.extend(encode_len8(len(raw)))
        payload.extend(raw)
        payload.append(0)
    while len(payload) % 4:
        payload.append(0)
    header_size = 28
    strings_start = header_size + 4 * len(values)
    chunk_size = strings_start + len(payload)
    out = bytearray()
    out.extend(struct.pack('<HHI', RES_STRING_POOL_TYPE, header_size, chunk_size))
    out.extend(struct.pack('<IIIII', len(values), 0, UTF8_FLAG, strings_start, 0))
    for off in offsets:
        out.extend(struct.pack('<I', off))
    out.extend(payload)
    return bytes(out)


def read_len8(data: bytes | bytearray, off: int) -> tuple[int, int]:
    first = data[off]
    if first & 0x80:
        return ((first & 0x7F) << 7) | data[off + 1], 2
    return first, 1


class StringPool:
    def __init__(self, data: bytearray, off: int):
        self.data = data
        self.off = off
        if u16(data, off) != RES_STRING_POOL_TYPE:
            raise ValueError(f'not a string pool at {off:#x}')
        self.header_size = u16(data, off + 2)
        self.chunk_size = u32(data, off + 4)
        self.count = u32(data, off + 8)
        self.flags = u32(data, off + 16)
        self.strings_start = u32(data, off + 20)
        self.utf8 = bool(self.flags & UTF8_FLAG)
        table = off + self.header_size
        self.offsets = [u32(data, table + i * 4) for i in range(self.count)]

    def _utf16_len(self, off: int) -> tuple[int, int]:
        first = u16(self.data, off)
        if first & 0x8000:
            second = u16(self.data, off + 2)
            return ((first & 0x7FFF) << 16) | second, 4
        return first, 2

    def _location(self, index: int) -> tuple[int, int, int, int]:
        pos = self.off + self.strings_start + self.offsets[index]
        if self.utf8:
            _char_len, n1 = read_len8(self.data, pos)
            byte_len, n2 = read_len8(self.data, pos + n1)
            return pos, n1, n2, byte_len
        char_len, n1 = self._utf16_len(pos)
        return pos, n1, 0, char_len * 2

    def get(self, index: int) -> str:
        pos, n1, n2, byte_len = self._location(index)
        start = pos + n1 + n2
        return bytes(self.data[start:start + byte_len]).decode('utf-8' if self.utf8 else 'utf-16-le')

    def replace_equal_length(self, old: str, new: str) -> int:
        old_b = old.encode('utf-8' if self.utf8 else 'utf-16-le')
        new_b = new.encode('utf-8' if self.utf8 else 'utf-16-le')
        if len(old_b) != len(new_b) or len(old) != len(new):
            raise ValueError('replacement must keep encoded and character lengths')
        changed = 0
        for i in range(self.count):
            if self.get(i) != old:
                continue
            pos, n1, n2, byte_len = self._location(i)
            if byte_len != len(new_b):
                raise ValueError('unexpected encoded length')
            start = pos + n1 + n2
            self.data[start:start + byte_len] = new_b
            changed += 1
        return changed


def patch_package_name(data: bytearray, package_off: int, name: str) -> None:
    raw = name.encode('utf-16-le') + b'\x00\x00'
    if len(raw) > 256:
        raise ValueError('package name too long')
    data[package_off + 12:package_off + 12 + 256] = raw.ljust(256, b'\x00')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('input', type=Path)
    ap.add_argument('output', type=Path)
    ap.add_argument('--package', default='nl.randy.ea888lab.stabl')
    args = ap.parse_args()

    original = bytearray(args.input.read_bytes())
    if u16(original, 0) != 0x0002 or u16(original, 2) != 12:
        raise ValueError('unexpected ResTable header')
    global_off = 12
    if u16(original, global_off) != RES_STRING_POOL_TYPE:
        raise ValueError('global string pool missing')
    old_global_size = u32(original, global_off + 4)
    package_bytes = bytes(original[global_off + old_global_size:])

    new_global = build_utf8_string_pool(['res/mipmap/app_icon.png', 'sans'])
    data = bytearray(original[:12] + new_global + package_bytes)
    struct.pack_into('<I', data, 4, len(data))

    package_off = 12 + len(new_global)
    if u16(data, package_off) != 0x0200:
        raise ValueError('package chunk missing after global pool')
    patch_package_name(data, package_off, args.package)

    type_strings_rel = u32(data, package_off + 268)
    key_strings_rel = u32(data, package_off + 276)
    type_pool = StringPool(data, package_off + type_strings_rel)
    key_pool = StringPool(data, package_off + key_strings_rel)
    if type_pool.replace_equal_length('string', 'mipmap') != 1:
        raise ValueError('could not repurpose string type as mipmap')
    if key_pool.replace_equal_length('app_name', 'app_icon') != 1:
        raise ValueError('could not rename app_name entry')

    # Verify type 1 / entry 0 remains a scalar TYPE_STRING pointing at global index 0.
    package_end = package_off + u32(data, package_off + 4)
    off = package_off + u16(data, package_off + 2)
    found = False
    while off < package_end:
        ctype = u16(data, off)
        csize = u32(data, off + 4)
        if ctype == 0x0201 and data[off + 8] == 1:
            header_size = u16(data, off + 2)
            entries_start = u32(data, off + 16)
            entry_off = u32(data, off + header_size)
            entry = off + entries_start + entry_off
            value = entry + u16(data, entry)
            if data[value + 3] != 0x03 or u32(data, value + 4) != 0:
                raise ValueError('resource 0x7f010000 is not TYPE_STRING global index 0')
            found = True
            break
        off += csize
    if not found:
        raise ValueError('type 1 resource entry not found')

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(data)
    print(f'wrote {args.output} ({len(data)} bytes)')
    print('0x7f010000 = mipmap/app_icon -> res/mipmap/app_icon.png')


if __name__ == '__main__':
    main()
