# Third-party textures

## RE:Fi Textures (`refi/`)

| | |
| --- | --- |
| **Pack** | REFI_Textures ("RE:Fi"), a 16px texture pack for Luanti/Minetest |
| **Author** | MysticTempest |
| **Source** | https://content.luanti.org/packages/MysticTempest/refi_textures/ |
| **Repository** | https://github.com/MysticTempest/REFI_Textures |
| **Release** | https://content.luanti.org/packages/MysticTempest/refi_textures/releases/36164/download/ (downloaded 2026-08-15) |
| **License** | Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0) |
| **License text** | `refi/LICENSE.txt`, copied verbatim from the release |

The license is stated as `CC-BY-SA-4.0` on the ContentDB package page, as
"License: CC BY-SA 4.0" in the repository README, and the release ships the
full CC BY-SA 4.0 legal code as `License.txt`. All three agree.

### What we vendored

`refi/` holds **397 PNGs** — only the files `../src/textures.js` names, copied
out of the release by `../tools/vendor-textures.mjs` and listed in
`refi/FILES.txt`. The rest of the pack (GUI themes, mob skins, items, armour,
alternate sets, ~4,100 further files) is not distributed here. Filenames are
unmodified; the files are byte-identical copies, flattened out of the pack's
mod folders into one directory because their basenames are unique.

### Share-alike obligations

CC BY-SA 4.0 is a copyleft licence, and these are the obligations it puts on
this repository and on anything built from it:

1. **Attribution.** Any distribution — including the deployed viewer page —
   must credit MysticTempest, name the pack, link the source, and state the
   licence. The viewer does this in its credits line; do not remove it.
2. **Licence notice.** The full licence text travels with the textures
   (`refi/LICENSE.txt`). Keep it next to them.
3. **Indicate modifications.** We make no modifications to the image files. The
   viewer *composes* them at load into a runtime texture atlas (each tile drawn
   2×2 into a padded cell) and multiplies a tint into some of them; that atlas
   is an adaptation, and it is produced in the browser rather than shipped.
4. **ShareAlike.** Adaptations of the textures — a repainted tile, a shipped
   atlas image, a derived pack — must themselves be released under CC BY-SA 4.0
   or a compatible licence. **This does not extend to Terrainist's own code.**
   The viewer's source merely *references* the textures by filename; the
   textures are not incorporated into it, so the two are an aggregate ("mere
   collection") rather than an adaptation, and the code keeps its own licence.
   If that ever stops being true — if a build step bakes an atlas PNG into a
   bundle — that PNG is an adaptation and must ship under CC BY-SA 4.0.

### Re-vendoring

```sh
curl -L -o refi.zip \
  https://content.luanti.org/packages/MysticTempest/refi_textures/releases/36164/download/
unzip refi.zip -d /tmp/refi
node tools/vendor-textures.mjs --pack /tmp/refi/refi_textures --check   # report only
node tools/vendor-textures.mjs --pack /tmp/refi/refi_textures           # copy
```

`--check` prints any filename the mapping table asks for that the pack does not
have. A miss is not fatal — that block falls back to the viewer's flat colour —
but it is nearly always a typo in the table.
