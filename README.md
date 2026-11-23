# PatchLedger

A browser-local code-review workbench with an immersive 3D interface, in a dark ledger-room theme or the original light paper theme. Compare two versions of a change, orbit the review map, read the evidence, record a human decision, and keep a handoff without uploading source.

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

1. Review one version, or compare two: pick the base and the updated files or folders. The comparison pairs files by path and labels each added, modified, unchanged or removed from SHA-256 fingerprints. Each side accepts up to 30 UTF-8 source files, 750 KB total. Folder paths keep same-named files distinct. Folder import skips dependency/generated directories, unsupported types and known credential filenames before reading them.
2. Switch between the dark and light themes from the top bar; the choice is remembered on this device. The 3D scenes recolour to match the theme.
3. Use the 3D review map or the list explorer with its change badges, plus the search, assessment, severity and change-scope filters, to narrow the queue. In the map, every node is a file: colour shows its change status (compare) or highest candidate level (single version), size follows line count and glow follows candidate count. Drag to orbit, scroll or pinch to zoom, click a file to open it. The sample change review is clearly labelled illustrative code and is never executed.
4. Read numbered source around a match, or expand the full file. Each file has a SHA-256 fingerprint. Removed files keep their base fingerprint on the record.
5. Mark a candidate Not reviewed, Needs a fix, Not an issue or Need more context. Add the reason, then move to the next unreviewed candidate. Keyboard: j/k moves through the queue, 1/2/3/0 records the decision, n jumps to the next unreviewed candidate, f toggles the full file, ? lists the shortcuts.
6. Save JSON for a restorable review, or export Markdown for a readable handoff. Both open with the decision summary and, in compare mode, the shape of the change. Restore JSON only after opening the exact same source files. File names and hashes must match, even when import order changes.

## Privacy and limits

- All inspection and notes run in the current browser tab. By default no source-upload endpoint, account, tracking or service worker is used. The optional companion server accepts only excerpts explicitly approved in the UI and sends them through the configured OpenClaw model. The only stored value is the theme choice (light or dark) in localStorage; source text and notes never touch storage.
- The hero scene and the review map are WebGL drawings rendered locally from data already in the tab; the vendored Three.js r187 build is served from this repository with no CDN or third-party request. The scenes are navigation and presentation, not analysis. If WebGL is unavailable, the explorer and queue work unchanged. All animation stops under a reduced-motion preference.
- JSON/Markdown assessment exports exclude source text. OpenClaw task exports include the selected excerpt. Assessment exports include file names, hashes and reviewer notes, so keep secrets out of notes too.
- Refreshing or closing clears source and notes. Unexported assessments trigger a browser warning where supported; export before leaving. Download initiation is not proof the file was saved, check browser downloads.
- Eight text-pattern checks cover dynamic evaluation, process execution, raw HTML sinks, disabled TLS verification, possible hardcoded credentials, weak hash functions, non-cryptographic randomness and unfinished-work markers. These are candidates, not proven defects or language-aware analysis. No match is not a security clearance.
- Basic credential checks are not a complete secret scanner. Do not open confidential code in an untrusted deployed copy of any app. Folder selection support varies by browser; individual files work as an alternative. The OS-level file-picker experience has not been tested on every platform.
- Large candidate lists are capped per file and labelled. The queue initially renders at most 100 entries, with a control to load more.
- The static hosted edition does not run inference. It can export a selected excerpt as an OpenClaw task. The optional companion server implements real OpenClaw CLI review but requires your own activated model configuration. No live model run, speed, model access or hackathon qualification is claimed for this release.

## Source and tests

`web/` contains the editable app, the shared pattern checker and the version comparator. `web/ledger.mjs` handles local assessment exports and hash-bound restore. `web/hero3d.mjs` renders the hero scene, `web/map3d.mjs` the interactive review map and `web/motion.mjs` the scroll reveals; `web/three.module.min.js` and `web/three.core.min.js` are the vendored, unmodified Three.js r187 module build. `src/inspect.mjs` is the Node hashing adapter used by tests. The build copies static app assets only.

This repository is the browser-local product release. Experimental model runners, account/access records, publication receipts, videos and personal screenshots are intentionally excluded.

Built by Nagabhushana Raju S. All rights reserved; no redistribution license has been granted.


## Optional OpenClaw review connection (1.5.0)

The deployed static app includes **Export OpenClaw task**, which downloads the selected candidate and surrounding numbered lines. Inspect the text for secrets before using it. Run it with your own configured OpenClaw harness:

```sh
openclaw agent exec --message-file patchledger-review-task.txt --json
```

For in-app review, install OpenClaw 2026.11.7 separately with its supported Node runtime (Node 24.16+ in the 24 series, or 26.1+). The local desk itself still works on Node 22. Prepare a private OpenClaw config outside the repository, with a model you are authorized to use and any credentials held outside source control. No provider is selected for you. Do not commit keys or configs. In that config disable tools for the review agent and set `agents.defaults.contextInjection` to `never`.

Start the companion with explicit configuration (replace paths and model identifier):

```sh
PATCHLEDGER_AI_ENABLED=1 \
PATCHLEDGER_OPENCLAW_CONFIG=/absolute/private/openclaw.json \
PATCHLEDGER_MODEL=provider/model \
npm start
```

Then open localhost:4317, load a review, select a candidate, and use **Check companion connection**, **Prepare selected excerpt**, and the consent checkbox. The server uses `openclaw agent exec` with a temporary working directory, denies all tools, validates line citations, caps request/output size, limits concurrency and deletes its temporary directory. It never auto-applies model suggestions or retries a model request. Failed access is an error, not a local fallback pretending to be AI. Ordinary provider logs or OpenClaw state may have their own retention rules; inspect your configured service before sending private code.

This companion is loopback-only. GitHub Pages cannot run it. No publicly hosted backend, cloud model key, or model entitlement is included. The browser task export works on Pages without a backend. Unit tests use explicitly labelled fixtures for successful model responses. A real model review remains unverified until access is configured and a live turn succeeds.
