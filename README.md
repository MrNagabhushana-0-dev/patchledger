# PatchLedger

A browser-local code-review workbench. Read the evidence, record a human decision, and keep a handoff without uploading source.

## Run

Node.js 22 or newer. No packages, API key, account or payment setup are required.

```sh
npm start
# open http://127.0.0.1:4317
npm test
npm run build
```

Deploy the generated `public/` directory on a static HTTPS host. Browser SHA-256 hashing requires HTTPS or localhost. The included Vercel configuration selects that directory. The local server binds to 127.0.0.1.

## Review a change

1. Choose up to 30 UTF-8 source files, 750 KB total, or open a small folder. Folder paths keep same-named files distinct. Folder import skips dependency/generated directories, unsupported types and known credential filenames before reading them.
2. Use the explorer, search and assessment filter to narrow the queue. The sample workspace is clearly labelled illustrative code and is never executed.
3. Read numbered source around a match, or expand the full file. Each file has a SHA-256 fingerprint.
4. Mark a candidate Not reviewed, Needs a fix, Not an issue or Need more context. Add the reason, then move to the next unreviewed candidate.
5. Save JSON for a restorable review, or export Markdown for a readable handoff. Restore JSON only after opening the exact same source files. File names and hashes must match, even when import order changes.

## Privacy and limits

- All inspection and notes run in the current browser tab. No source-upload endpoint, account, tracking, localStorage or service worker is used.
- Exports exclude source text. They include file names, hashes and reviewer notes, so keep secrets out of notes too.
- Refreshing or closing clears source and notes. Unexported assessments trigger a browser warning where supported; export before leaving. Download initiation is not proof the file was saved, check browser downloads.
- Five text-pattern checks cover dynamic evaluation, process execution, raw HTML sinks, disabled TLS verification and unfinished-work markers. These are candidates, not proven defects or language-aware analysis. No match is not a security clearance.
- Basic credential checks are not a complete secret scanner. Do not open confidential code in an untrusted deployed copy of any app. Folder selection support varies by browser; individual files work as an alternative. The OS-level file-picker experience has not been tested on every platform.
- Large candidate lists are capped per file and labelled. The queue initially renders at most 100 entries, with a control to load more.
- This version does not run Kimi, Cerebras, OpenClaw or any other AI model. No model speed, inferred verdict or successful hackathon qualification is claimed. Model integration is future work, not a built feature.

## Source and tests

`web/` contains the editable app and shared pattern checker. `web/ledger.mjs` handles local assessment exports and hash-bound restore. `src/inspect.mjs` is the Node hashing adapter used by tests. The build copies static app assets only.

This repository is the browser-local product release. Experimental model runners, account/access records, publication receipts, videos and personal screenshots are intentionally excluded.

Built by Nagabhushana Raju S. All rights reserved; no redistribution license has been granted.
