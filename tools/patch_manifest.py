#!/usr/bin/env python3
"""Patch the binary AndroidManifest.xml for EA888 Lab v1.3.0.

Besides package/version updates, the script repurposes the unused
android:fullBackupContent slot as android:icon and points it at resource
0x7f010000. tools/patch_resources_icon.py turns that resource into the bundled
Scirocco launcher icon. No Android SDK/aapt is required.
"""
from __future__ import annotations

import argparse
import struct
from pathlib import Path
from typing import List, Tuple

RES_STRING_POOL_TYPE = 0x0001
RES_XML_RESOURCE_MAP_TYPE = 0x0180
RES_XML_START_ELEMENT_TYPE = 0x0102
UTF8_FLAG = 0x00000100
ANDROID_ICON_RESOURCE_ID = 0x01010002
APP_ICON_RESOURCE_ID = 0x7F010000


def u16(data: bytes | bytearray, off: int) -> int:
    return struct.unpack_from('<H', data, off)[0]


def u32(data: bytes | bytearray, off: int) -> int:
    return struct.unpack_from('<I', data, off)[0]


def read_len8(data: bytes | bytearray, off: int) -> Tuple[int, int]:
    first = data[off]
    if first & 0x80:
        return ((first & 0x7F) << 7) | data[off + 1], 2
    return first, 1


def read_len16(data: bytes | bytearray, off: int) -> Tuple[int, int]:
    first = u16(data, off)
    if first & 0x8000:
        second = u16(data, off + 2)
        return ((first & 0x7FFF) << 16) | second, 4
    return first, 2


class StringPool:
    def __init__(self, data: bytearray, off: int):
        self.data = data
        self.off = off
        self.header_size = u16(data, off + 2)
        self.chunk_size = u32(data, off + 4)
        self.count = u32(data, off + 8)
        self.style_count = u32(data, off + 12)
        self.flags = u32(data, off + 16)
        self.strings_start = u32(data, off + 20)
        self.utf8 = bool(self.flags & UTF8_FLAG)
        offsets_off = off + self.header_size
        self.offsets = [u32(data, offsets_off + i * 4) for i in range(self.count)]
        self.strings = [self._read(i) for i in range(self.count)]

    def _read(self, idx: int) -> str:
        pos = self.off + self.strings_start + self.offsets[idx]
        if self.utf8:
            _, n1 = read_len8(self.data, pos)
            byte_len, n2 = read_len8(self.data, pos + n1)
            start = pos + n1 + n2
            return bytes(self.data[start:start + byte_len]).decode('utf-8')
        char_len, n = read_len16(self.data, pos)
        start = pos + n
        return bytes(self.data[start:start + char_len * 2]).decode('utf-16le')

    def get(self, idx: int) -> str:
        if idx == 0xFFFFFFFF:
            return ''
        return self.strings[idx]

    def index(self, value: str) -> int:
        return self.strings.index(value)

    def replace_equal_length(self, old: str, new: str) -> int:
        if len(old) != len(new):
            raise ValueError(f'equal character lengths required: {old!r}, {new!r}')
        matches = 0
        for idx, value in enumerate(self.strings):
            if value != old:
                continue
            pos = self.off + self.strings_start + self.offsets[idx]
            if self.utf8:
                _, n1 = read_len8(self.data, pos)
                byte_len, n2 = read_len8(self.data, pos + n1)
                raw = new.encode('utf-8')
                if len(raw) != byte_len:
                    raise ValueError('equal UTF-8 byte length required')
                start = pos + n1 + n2
                self.data[start:start + byte_len] = raw
            else:
                char_len, n = read_len16(self.data, pos)
                raw = new.encode('utf-16le')
                if len(raw) != char_len * 2:
                    raise ValueError('equal UTF-16 byte length required')
                start = pos + n
                self.data[start:start + len(raw)] = raw
            self.strings[idx] = new
            matches += 1
        return matches

    def replace_shrink(self, old: str, new: str) -> int:
        """Replace a string with a shorter one without moving later offsets."""
        if len(new) > len(old):
            raise ValueError('replacement must not grow')
        matches = 0
        for idx, value in enumerate(self.strings):
            if value != old:
                continue
            pos = self.off + self.strings_start + self.offsets[idx]
            if self.utf8:
                old_chars, n1 = read_len8(self.data, pos)
                old_bytes, n2 = read_len8(self.data, pos + n1)
                raw = new.encode('utf-8')
                if old_chars >= 0x80 or old_bytes >= 0x80 or len(new) >= 0x80 or len(raw) >= 0x80:
                    raise ValueError('only short UTF-8 strings supported')
                self.data[pos] = len(new)
                self.data[pos + n1] = len(raw)
                start = pos + n1 + n2
                capacity = old_bytes + 1
                replacement = raw + b'\x00'
                self.data[start:start + capacity] = replacement.ljust(capacity, b'\x00')
            else:
                old_chars, n = read_len16(self.data, pos)
                if n != 2 or old_chars >= 0x8000:
                    raise ValueError('only short UTF-16 strings supported')
                raw = new.encode('utf-16le')
                struct.pack_into('<H', self.data, pos, len(new))
                start = pos + n
                capacity = old_chars * 2 + 2
                replacement = raw + b'\x00\x00'
                self.data[start:start + capacity] = replacement.ljust(capacity, b'\x00')
            self.strings[idx] = new
            matches += 1
        return matches


def find_string_pool(data: bytearray) -> StringPool:
    xml_header_size = u16(data, 2)
    total_size = u32(data, 4)
    off = xml_header_size
    while off + 8 <= total_size:
        chunk_type = u16(data, off)
        size = u32(data, off + 4)
        if chunk_type == RES_STRING_POOL_TYPE:
            return StringPool(data, off)
        if size < 8:
            break
        off += size
    raise ValueError('string pool not found')


def iter_chunks(data: bytearray):
    total_size = u32(data, 4)
    off = u16(data, 2)
    while off + 8 <= total_size:
        chunk_type = u16(data, off)
        header_size = u16(data, off + 2)
        size = u32(data, off + 4)
        if size < 8 or off + size > total_size:
            raise ValueError(f'invalid XML chunk at {off}')
        yield off, chunk_type, header_size, size
        off += size


def patch_integer_attributes(data: bytearray, pool: StringPool, replacements: dict[str, int]) -> List[Tuple[str, int, int]]:
    changes: List[Tuple[str, int, int]] = []
    for off, chunk_type, _header_size, _size in iter_chunks(data):
        if chunk_type != RES_XML_START_ELEMENT_TYPE:
            continue
        name_idx = u32(data, off + 20)
        element_name = pool.get(name_idx)
        attr_start = u16(data, off + 24)
        attr_size = u16(data, off + 26)
        attr_count = u16(data, off + 28)
        attrs_off = off + 16 + attr_start
        for i in range(attr_count):
            aoff = attrs_off + i * attr_size
            attr_name = pool.get(u32(data, aoff + 4))
            if attr_name not in replacements:
                continue
            data_type = data[aoff + 15]
            if data_type not in (0x10, 0x11, 0x12):
                raise ValueError(f'{attr_name} is not an integer attribute (type {data_type:#x})')
            old = u32(data, aoff + 16)
            new = replacements[attr_name]
            struct.pack_into('<I', data, aoff + 16, new)
            changes.append((f'{element_name}.{attr_name}', old, new))
    return changes


def patch_icon(data: bytearray, pool: StringPool, icon_string_index: int) -> None:
    # The resource-map array is indexed by string-pool index for framework attrs.
    resource_map_off = None
    for off, chunk_type, header_size, size in iter_chunks(data):
        if chunk_type == RES_XML_RESOURCE_MAP_TYPE:
            resource_map_off = off
            count = (size - header_size) // 4
            if icon_string_index >= count:
                raise ValueError('icon string index outside resource map')
            struct.pack_into('<I', data, off + header_size + icon_string_index * 4, ANDROID_ICON_RESOURCE_ID)
            break
    if resource_map_off is None:
        raise ValueError('resource map not found')

    found = False
    for off, chunk_type, _header_size, _size in iter_chunks(data):
        if chunk_type != RES_XML_START_ELEMENT_TYPE or pool.get(u32(data, off + 20)) != 'application':
            continue
        attr_start = u16(data, off + 24)
        attr_size = u16(data, off + 26)
        attr_count = u16(data, off + 28)
        attrs_off = off + 16 + attr_start
        for i in range(attr_count):
            aoff = attrs_off + i * attr_size
            if pool.get(u32(data, aoff + 4)) != 'icon':
                continue
            struct.pack_into('<I', data, aoff + 8, 0xFFFFFFFF)  # no raw string
            struct.pack_into('<H', data, aoff + 12, 8)          # Res_value.size
            data[aoff + 14] = 0
            data[aoff + 15] = 0x01                             # TYPE_REFERENCE
            struct.pack_into('<I', data, aoff + 16, APP_ICON_RESOURCE_ID)
            found = True
            break
    if not found:
        raise ValueError('application icon attribute slot not found')


def verify_icon(data: bytearray, pool: StringPool) -> None:
    found = False
    for off, chunk_type, _header_size, _size in iter_chunks(data):
        if chunk_type != RES_XML_START_ELEMENT_TYPE or pool.get(u32(data, off + 20)) != 'application':
            continue
        attr_start = u16(data, off + 24)
        attr_size = u16(data, off + 26)
        attr_count = u16(data, off + 28)
        attrs_off = off + 16 + attr_start
        for i in range(attr_count):
            aoff = attrs_off + i * attr_size
            if pool.get(u32(data, aoff + 4)) == 'icon':
                if data[aoff + 15] != 0x01 or u32(data, aoff + 16) != APP_ICON_RESOURCE_ID:
                    raise ValueError('invalid application icon reference')
                found = True
    if not found:
        raise ValueError('application icon reference missing')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('input', type=Path)
    ap.add_argument('output', type=Path)
    args = ap.parse_args()

    data = bytearray(args.input.read_bytes())
    pool = find_string_pool(data)
    replacements = [
        ('nl.randy.ea888lab.debug', 'nl.randy.ea888lab.stabl'),
        ('0.1.1-debug', '1.3.0-debug'),
        ('EA888 Lab', 'EA888 LAB'),
    ]
    for old, new in replacements:
        count = pool.replace_equal_length(old, new)
        if count == 0:
            raise ValueError(f'string not found: {old}')
        print(f'string {old!r} -> {new!r} ({count}x)')

    if pool.replace_shrink('fullBackupContent', 'icon') != 1:
        raise ValueError('could not repurpose fullBackupContent as icon')
    icon_index = pool.index('icon')
    patch_icon(data, pool, icon_index)

    changes = patch_integer_attributes(data, pool, {
        'versionCode': 130,
        'targetSdkVersion': 29,
    })
    for name, old, new in changes:
        print(f'attribute {name}: {old} -> {new}')
    changed_names = {name.split('.')[-1] for name, _, _ in changes}
    if {'versionCode', 'targetSdkVersion'} - changed_names:
        raise ValueError(f'missing integer attributes: {sorted({"versionCode", "targetSdkVersion"} - changed_names)}')

    verify_icon(data, pool)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(data)
    print(f'android:icon -> @0x{APP_ICON_RESOURCE_ID:08x}')
    print(f'wrote {args.output} ({len(data)} bytes)')


if __name__ == '__main__':
    main()
