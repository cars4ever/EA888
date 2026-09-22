#!/usr/bin/env python3
"""Build a minimal classes.dex containing nl.randy.ea888lab.MainActivity.

The generated Activity hosts a JavaScript-enabled WebView and loads
file:///android_asset/index.html.  It deliberately uses only Android framework
classes, so the APK remains offline and dependency-free.
"""
from __future__ import annotations

import argparse
import hashlib
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

DEX_MAGIC = b"dex\n035\x00"
NO_INDEX = 0xFFFFFFFF


def align(value: int, boundary: int = 4) -> int:
    return (value + boundary - 1) & ~(boundary - 1)


def uleb128(value: int) -> bytes:
    if value < 0:
        raise ValueError("ULEB128 cannot encode negative values")
    out = bytearray()
    while True:
        b = value & 0x7F
        value >>= 7
        if value:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def pack_u16_words(words: Sequence[int]) -> bytes:
    return b"".join(struct.pack("<H", w & 0xFFFF) for w in words)


def shorty_char(descriptor: str) -> str:
    if descriptor.startswith("L") or descriptor.startswith("["):
        return "L"
    return descriptor[0]


@dataclass(frozen=True)
class Proto:
    return_type: str
    params: Tuple[str, ...]

    @property
    def shorty(self) -> str:
        return shorty_char(self.return_type) + "".join(shorty_char(p) for p in self.params)


@dataclass(frozen=True)
class MethodRef:
    owner: str
    name: str
    proto: Proto


class DexBuilder:
    def __init__(self) -> None:
        self.main = "Lnl/randy/ea888lab/MainActivity;"
        self.activity = "Landroid/app/Activity;"
        self.bundle = "Landroid/os/Bundle;"
        self.context = "Landroid/content/Context;"
        self.webview = "Landroid/webkit/WebView;"
        self.websettings = "Landroid/webkit/WebSettings;"
        self.view = "Landroid/view/View;"
        self.string = "Ljava/lang/String;"
        self.void = "V"
        self.boolean = "Z"
        self.integer = "I"

        self.p_void = Proto(self.void, ())
        self.p_bundle_void = Proto(self.void, (self.bundle,))
        self.p_context_void = Proto(self.void, (self.context,))
        self.p_get_settings = Proto(self.websettings, ())
        self.p_bool_void = Proto(self.void, (self.boolean,))
        self.p_int_void = Proto(self.void, (self.integer,))
        self.p_string_void = Proto(self.void, (self.string,))
        self.p_view_void = Proto(self.void, (self.view,))

        self.methods_unsorted = [
            MethodRef(self.activity, "<init>", self.p_void),
            MethodRef(self.activity, "onCreate", self.p_bundle_void),
            MethodRef(self.activity, "setContentView", self.p_view_void),
            MethodRef(self.webview, "<init>", self.p_context_void),
            MethodRef(self.webview, "getSettings", self.p_get_settings),
            MethodRef(self.webview, "setBackgroundColor", self.p_int_void),
            MethodRef(self.webview, "loadUrl", self.p_string_void),
            MethodRef(self.websettings, "setJavaScriptEnabled", self.p_bool_void),
            MethodRef(self.websettings, "setDomStorageEnabled", self.p_bool_void),
            MethodRef(self.main, "<init>", self.p_void),
            MethodRef(self.main, "onCreate", self.p_bundle_void),
        ]

        self.protos_unsorted = sorted(
            {m.proto for m in self.methods_unsorted},
            key=lambda p: (p.return_type, p.params),
        )
        self.type_descriptors = {
            self.main,
            self.activity,
            self.bundle,
            self.context,
            self.webview,
            self.websettings,
            self.view,
            self.string,
            self.void,
            self.boolean,
            self.integer,
        }

        strings = set(self.type_descriptors)
        strings.update(m.name for m in self.methods_unsorted)
        strings.update(p.shorty for p in self.protos_unsorted)
        strings.update({"MainActivity.java", "file:///android_asset/index.html"})
        self.strings = sorted(strings)
        self.string_idx = {s: i for i, s in enumerate(self.strings)}

        self.types = sorted(self.type_descriptors, key=lambda d: self.string_idx[d])
        self.type_idx = {t: i for i, t in enumerate(self.types)}

        # DEX proto_ids are sorted by return_type_idx, then parameter type list.
        self.protos = sorted(
            set(self.protos_unsorted),
            key=lambda p: (self.type_idx[p.return_type], tuple(self.type_idx[x] for x in p.params)),
        )
        self.proto_idx = {p: i for i, p in enumerate(self.protos)}

        self.methods = sorted(
            self.methods_unsorted,
            key=lambda m: (self.type_idx[m.owner], self.string_idx[m.name], self.proto_idx[m.proto]),
        )
        self.method_idx = {m: i for i, m in enumerate(self.methods)}

    def m(self, owner: str, name: str, proto: Proto) -> int:
        return self.method_idx[MethodRef(owner, name, proto)]

    def _code_constructor(self) -> bytes:
        words = [
            0x1070,  # invoke-direct {v0}, method@BBBB
            self.m(self.activity, "<init>", self.p_void),
            0x0000,  # C=v0
            0x000E,  # return-void
        ]
        header = struct.pack(
            "<HHHHII",
            1,  # registers_size
            1,  # ins_size
            1,  # outs_size
            0,  # tries_size
            0,  # debug_info_off
            len(words),
        )
        return header + pack_u16_words(words)

    def _code_on_create(self) -> bytes:
        url_idx = self.string_idx["file:///android_asset/index.html"]
        if url_idx > 0xFFFF:
            raise ValueError("const-string index too large for 21c")

        words = [
            0x206F,  # invoke-super {v2, v3}, Activity.onCreate(Bundle)
            self.m(self.activity, "onCreate", self.p_bundle_void),
            0x0032,
            0x0022,  # new-instance v0, WebView
            self.type_idx[self.webview],
            0x2070,  # invoke-direct {v0, v2}, WebView.<init>(Context)
            self.m(self.webview, "<init>", self.p_context_void),
            0x0020,
            0x106E,  # invoke-virtual {v0}, getSettings
            self.m(self.webview, "getSettings", self.p_get_settings),
            0x0000,
            0x010C,  # move-result-object v1
            0x1312,  # const/4 v3, #+1
            0x206E,  # invoke-virtual {v1, v3}, setJavaScriptEnabled
            self.m(self.websettings, "setJavaScriptEnabled", self.p_bool_void),
            0x0031,
            0x206E,  # invoke-virtual {v1, v3}, setDomStorageEnabled
            self.m(self.websettings, "setDomStorageEnabled", self.p_bool_void),
            0x0031,
            0x0314,  # const v3, 0xff000000 (black)
            0x0000,
            0xFF00,
            0x206E,  # invoke-virtual {v0, v3}, setBackgroundColor
            self.m(self.webview, "setBackgroundColor", self.p_int_void),
            0x0030,
            0x011A,  # const-string v1, url
            url_idx,
            0x206E,  # invoke-virtual {v0, v1}, loadUrl
            self.m(self.webview, "loadUrl", self.p_string_void),
            0x0010,
            0x206E,  # invoke-virtual {v2, v0}, Activity.setContentView(View)
            self.m(self.activity, "setContentView", self.p_view_void),
            0x0002,
            0x000E,  # return-void
        ]
        header = struct.pack(
            "<HHHHII",
            4,  # registers_size: v0/v1 locals, v2=this, v3=bundle/temp
            2,  # ins_size
            2,  # outs_size
            0,
            0,
            len(words),
        )
        return header + pack_u16_words(words)

    def build(self) -> bytes:
        header_size = 0x70
        string_ids_off = header_size
        type_ids_off = string_ids_off + 4 * len(self.strings)
        proto_ids_off = type_ids_off + 4 * len(self.types)
        method_ids_off = proto_ids_off + 12 * len(self.protos)
        class_defs_off = method_ids_off + 8 * len(self.methods)
        class_defs_size = 1
        data_off = align(class_defs_off + 32 * class_defs_size, 4)

        # Build data section in an address-aware bytearray.
        data = bytearray()

        def absolute() -> int:
            return data_off + len(data)

        def pad4() -> None:
            while absolute() % 4:
                data.append(0)

        # Parameter type lists.
        param_lists: List[Tuple[str, ...]] = []
        for p in self.protos:
            if p.params and p.params not in param_lists:
                param_lists.append(p.params)
        # Stable ordering by type indexes gives deterministic builds.
        param_lists.sort(key=lambda xs: tuple(self.type_idx[x] for x in xs))
        type_list_off: Dict[Tuple[str, ...], int] = {}
        first_type_list_off = 0
        for params in param_lists:
            pad4()
            off = absolute()
            if not first_type_list_off:
                first_type_list_off = off
            type_list_off[params] = off
            data.extend(struct.pack("<I", len(params)))
            for desc in params:
                data.extend(struct.pack("<H", self.type_idx[desc]))
            # Individual type_list items are 4-byte aligned in practice.
            while absolute() % 4:
                data.append(0)

        # Code items.
        pad4()
        constructor_code_off = absolute()
        data.extend(self._code_constructor())
        pad4()
        on_create_code_off = absolute()
        data.extend(self._code_on_create())

        # Class data item. code_off values are now known.
        class_data_off = absolute()
        constructor_idx = self.m(self.main, "<init>", self.p_void)
        on_create_idx = self.m(self.main, "onCreate", self.p_bundle_void)
        class_data = bytearray()
        class_data.extend(uleb128(0))  # static fields
        class_data.extend(uleb128(0))  # instance fields
        class_data.extend(uleb128(1))  # direct methods
        class_data.extend(uleb128(1))  # virtual methods
        class_data.extend(uleb128(constructor_idx))
        class_data.extend(uleb128(0x10001))  # public | constructor
        class_data.extend(uleb128(constructor_code_off))
        class_data.extend(uleb128(on_create_idx))  # method_idx_diff starts at 0 for virtual methods
        class_data.extend(uleb128(0x0001))  # public
        class_data.extend(uleb128(on_create_code_off))
        data.extend(class_data)

        # String data items in string-id order.
        string_data_offs: List[int] = []
        first_string_data_off = 0
        for s in self.strings:
            off = absolute()
            if not first_string_data_off:
                first_string_data_off = off
            string_data_offs.append(off)
            # All generated strings are ASCII, so UTF-16 length equals Python len.
            encoded = s.encode("utf-8")
            data.extend(uleb128(len(s)))
            data.extend(encoded)
            data.append(0)

        # Map list must be last and aligned.
        pad4()
        map_off = absolute()
        map_entries: List[Tuple[int, int, int]] = [
            (0x0000, 1, 0),
            (0x0001, len(self.strings), string_ids_off),
            (0x0002, len(self.types), type_ids_off),
            (0x0003, len(self.protos), proto_ids_off),
            (0x0005, len(self.methods), method_ids_off),
            (0x0006, 1, class_defs_off),
        ]
        if param_lists:
            map_entries.append((0x1001, len(param_lists), first_type_list_off))
        map_entries.extend([
            (0x2001, 2, constructor_code_off),
            (0x2000, 1, class_data_off),
            (0x2002, len(self.strings), first_string_data_off),
            (0x1000, 1, map_off),
        ])
        map_entries.sort(key=lambda x: x[2])
        data.extend(struct.pack("<I", len(map_entries)))
        for item_type, size, off in map_entries:
            data.extend(struct.pack("<HHII", item_type, 0, size, off))

        file_size = data_off + len(data)
        data_size = len(data)

        # ID sections.
        string_ids = b"".join(struct.pack("<I", off) for off in string_data_offs)
        type_ids = b"".join(struct.pack("<I", self.string_idx[t]) for t in self.types)

        proto_ids = bytearray()
        for p in self.protos:
            proto_ids.extend(struct.pack(
                "<III",
                self.string_idx[p.shorty],
                self.type_idx[p.return_type],
                type_list_off.get(p.params, 0),
            ))

        method_ids = bytearray()
        for m in self.methods:
            method_ids.extend(struct.pack(
                "<HHI",
                self.type_idx[m.owner],
                self.proto_idx[m.proto],
                self.string_idx[m.name],
            ))

        class_def = struct.pack(
            "<IIIIIIII",
            self.type_idx[self.main],
            0x0001,  # public
            self.type_idx[self.activity],
            0,  # interfaces_off
            self.string_idx["MainActivity.java"],
            0,  # annotations_off
            class_data_off,
            0,  # static_values_off
        )

        header = struct.pack(
            "<8sI20s20I",
            DEX_MAGIC,
            0,  # checksum patched later
            b"\x00" * 20,  # signature patched later
            file_size,
            header_size,
            0x12345678,
            0, 0,  # link_size, link_off
            map_off,
            len(self.strings), string_ids_off,
            len(self.types), type_ids_off,
            len(self.protos), proto_ids_off,
            0, 0,  # field_ids
            len(self.methods), method_ids_off,
            1, class_defs_off,
            data_size, data_off,
        )
        if len(header) != header_size:
            raise AssertionError(f"DEX header is {len(header)} bytes, expected {header_size}")

        out = bytearray(header)
        out.extend(string_ids)
        out.extend(type_ids)
        out.extend(proto_ids)
        out.extend(method_ids)
        out.extend(class_def)
        while len(out) < data_off:
            out.append(0)
        out.extend(data)
        if len(out) != file_size:
            raise AssertionError((len(out), file_size))

        signature = hashlib.sha1(out[32:]).digest()
        out[12:32] = signature
        checksum = zlib.adler32(out[12:]) & 0xFFFFFFFF
        out[8:12] = struct.pack("<I", checksum)
        return bytes(out)


def validate_dex(blob: bytes) -> None:
    if blob[:8] != DEX_MAGIC:
        raise ValueError("bad DEX magic")
    checksum, = struct.unpack_from("<I", blob, 8)
    expected_checksum = zlib.adler32(blob[12:]) & 0xFFFFFFFF
    if checksum != expected_checksum:
        raise ValueError("bad DEX checksum")
    if blob[12:32] != hashlib.sha1(blob[32:]).digest():
        raise ValueError("bad DEX signature")
    file_size, header_size, endian = struct.unpack_from("<III", blob, 32)
    if file_size != len(blob) or header_size != 0x70 or endian != 0x12345678:
        raise ValueError("bad DEX header values")
    map_off, = struct.unpack_from("<I", blob, 52)
    if not (0x70 <= map_off < len(blob)):
        raise ValueError("bad map offset")
    map_size, = struct.unpack_from("<I", blob, map_off)
    if not 5 <= map_size <= 30:
        raise ValueError("implausible map size")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    blob = DexBuilder().build()
    validate_dex(blob)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(blob)
    print(f"wrote {args.output} ({len(blob)} bytes)")


if __name__ == "__main__":
    main()
