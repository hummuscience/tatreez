# Tirazain Archive Import

This directory holds patterns imported from
[tirazain.com/archive](https://tirazain.com/archive/) — a community archive of
Palestinian tatreez patterns. Each pattern lives in its own subdirectory by
slug, and a top-level `manifest.json` lists what's expected.

The `import_tirazain` script reads this directory and produces a
TypeScript module the app loads at startup.

## Layout

```
resources/tirazain/
├── README.md                 (this file)
├── manifest.json             (one entry per pattern; checked into git)
├── lily-f5j49-2ydlp/         (pattern slug from the source URL)
│   ├── pattern.oxs           (the OXS chart — required)
│   ├── thumb.png             (preview image — optional)
│   └── …                     (other formats from the archive Drive folder)
└── sarwa-cypress-ramallah/
    └── pattern.oxs
```

## Manifest format

`manifest.json` is a JSON array of entries:

```json
[
  {
    "slug": "lily-f5j49-2ydlp",
    "name": "Lily",
    "arabicName": "زنبق",
    "region": "Ramallah",
    "url": "https://tirazain.com/archive/p/lily-f5j49-2ydlp",
    "stitchCount": 1858,
    "colors": 4
  }
]
```

Required: `slug`, `name`, `url`. Everything else is optional but recommended.
The `slug` must match the subdirectory name.

## Adding patterns manually

1. Visit the pattern page on tirazain.com (e.g. `/archive/p/<slug>`).
2. Click the "Download Files" button to open the Google Drive folder.
3. Download the `.oxs` and `.png` files (you can ignore the .pcs/.dst/.pes/.pdf —
   those are machine embroidery formats we don't use).
4. Create `resources/tirazain/<slug>/` and put the files in it as
   `pattern.oxs` and `thumb.png`.
5. Append an entry to `manifest.json` (or run `npm run scaffold-tirazain` to
   bootstrap one — TODO).
6. Run `npm run import-tirazain` to regenerate the in-app archive list.

## Attribution

Each imported pattern keeps its source URL and original metadata, displayed
in the planner UI. The intent is to give users who use these patterns a clear
way back to the original archive.
