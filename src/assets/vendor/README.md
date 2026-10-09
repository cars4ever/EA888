# Packaged save compression

`lz-string.min.js` is the unchanged `libs/lz-string.min.js` from npm **lz-string 1.5.0**,
MIT licensed; its license is included in `lz-string.LICENSE.txt`. Upstream:
https://github.com/pieroxy/lz-string/tree/1.5.0

Reproduce with `npm ci`, then copy that file and `LICENSE` from `node_modules/lz-string/`.
`tests/test_save_codec.js` checks the copied implementation against the pinned package.
It is loaded locally by the WebView, with no CDN or server dependency.
