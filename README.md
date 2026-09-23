# Ocarina Sight Reading

A sight-reading trainer for the **12-hole Alto C ocarina**. It shows a note on a
treble clef, listens through the microphone, and tells you whether you played
it. If you get stuck, help arrives in two stages: the note's **name** appears
above the staff halfway through the hint timeout, and the **fingering diagram**
at the end of it. Naming the note answers "which note is that?" and leaves
"how do I play it?" to you — the half worth struggling with.

Covers the **thirteen naturals from A4 to F6**. Sharps and flats are out of
scope for now — the detector still recognises them, so playing one reads as a
wrong note rather than as noise, but they are not drilled and have no diagrams.

Vue 3 + Vite, plain JavaScript, installable as a PWA.

## Getting set up

If you have never run a project like this before, this section is for you. It
takes about ten minutes, and you only do it once.

### 1. Install Node.js

This app is built with tools that run on **Node.js**. Installing Node also
installs **npm**, the command used below — you do not install npm separately,
and there is no separate npm version to pick.

Go to **[nodejs.org](https://nodejs.org)** and download the version labelled
**LTS** (the big button on the left — "LTS" means Long Term Support, the stable
one). Run the installer and accept the defaults.

- **Windows** — the `.msi` installer. When it offers "Tools for Native Modules",
  you can safely skip it; this project does not need them.
- **macOS** — the `.pkg` installer. If you already use [Homebrew](https://brew.sh),
  `brew install node` works just as well.
- **Linux** — your package manager's Node is often too old. Use
  [nodesource](https://github.com/nodesource/distributions) or
  [nvm](https://github.com/nvm-sh/nvm) rather than `apt install nodejs`.

**Which versions work:** Node **22.12 or newer**, specifically an
*even-numbered* release — 22.12+, 24, or 26 and up. Odd-numbered versions
(23, 25) are short-lived previews that the test runner does not support. The
LTS download is always an even-numbered release, so following the link above
gets this right without thinking about it.

### 2. Check it worked

Open a terminal — **Terminal** on macOS (Applications → Utilities), **Command
Prompt** or **PowerShell** on Windows — and run:

```bash
node --version
```

You should see something like `v22.12.0` or higher. If the command is not found,
close the terminal, open a new one, and try again; installers do not always
reach a window that was already open.

### 3. Get the code

If you have `git`:

```bash
git clone https://github.com/brennydoogles/ocarina-sight-reading.git
```

If not, use the green **Code** button on the
[project page](https://github.com/brennydoogles/ocarina-sight-reading) and
choose **Download ZIP**, then unzip it.

Then move into the folder — type `cd ` (with a space) and drag the folder onto
the terminal window, or:

```bash
cd ocarina-sight-reading
```

### 4. Install and run

```bash
npm install
```

This downloads the libraries the app depends on into a `node_modules` folder.
It takes a minute or two the first time and prints a lot of text; that is
normal. Then:

```bash
npm run dev
```

Leave that running and open **http://localhost:5173** in your browser. The
browser will ask for microphone permission — say yes, or the app cannot hear
you. To stop the app, press **Ctrl+C** in the terminal.

> **If your Node is too old**, `npm install` prints a warning like this and
> then carries on anyway — but things will break later, so fix it rather than
> ignore it:
>
> ```
> npm warn EBADENGINE Unsupported engine {
> npm warn EBADENGINE   required: { node: '^22.12.0 || ^24.0.0 || >=26.0.0' },
> npm warn EBADENGINE   current: { node: 'v20.11.0', npm: '10.2.4' }
> npm warn EBADENGINE }
> ```
>
> Install a newer version from [nodejs.org](https://nodejs.org), then delete the
> `node_modules` folder and run `npm install` again.

## Running it

Once set up, starting it again is just:

```bash
npm install && npm run dev
```

Then open http://localhost:5173.

**To practise on your phone**, the app must be served over HTTPS — browsers only
grant microphone access in a secure context, and `http://<your-ip>:5173` is not
one. Use:

```bash
npm run dev:lan
```

That binds to your network and serves over HTTPS with a self-signed certificate.
Open the `https://` address it prints on your phone and accept the warning once.
Your phone must be on the same Wi-Fi network as the computer, and the browser
will warn that the certificate is not trusted — that is expected for a
self-signed certificate on your own network, and you can continue past it.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on localhost |
| `npm run render:fingerings` | Generate any missing fingering diagrams |
| `npm run check:fingerings` | Verify every note has a diagram file |
| `npm run tag:holes` | Re-derive hole ids in the diagrams from their labels |
| `npm run dev:lan` | Dev server over HTTPS on your LAN, for phone testing |
| `npm test` | Run the test suite |
| `npm run lint` | ESLint |
| `npm run build` | Production build into `dist/` |

## How it works

```
microphone → AnalyserNode (2048) → pitchy (McLeod) → gates → matcher → UI
```

`src/audio/detector.js` is pure: it takes a `Float32Array` and returns a
reading, with no Web Audio involved. That is what makes the synthetic-audio
tests possible — they feed generated sine waves straight through and assert on
the result, with no browser and no microphone.

Four gates run cheapest-first, each for a specific failure:

- **Noise gate** — stops room tone becoming phantom notes.
- **Clarity gate** — pitchy's confidence score; stops breath and handling noise.
- **Range guard** — rejects anything outside A4–F6 ± a semitone. Autocorrelation's
  characteristic mistake is an octave-down subharmonic, and this catches it.
- **Sustain** — the note must stay in tune for ~200 ms. Without this a note gets
  credited in passing as you slide through it, which teaches nothing.

Tolerance is configured in **cents**, not Hz: 10 Hz is a quarter-tone at A4 and a
sixth of that at F6.

## Layout

```
src/
├── music/
│   ├── pitch.js            Hz <-> MIDI <-> cents, note naming
│   ├── notes.js            instrument range, note pools
│   ├── fingerings.js       the 12-hole Alto C hole-state table (naturals)
│   ├── fingeringFiles.js   note -> diagram filename
│   ├── fingeringAssets.js  fetches and inlines the diagram files
│   └── exercise.js         exercise generation
├── audio/
│   ├── detector.js     pure pitch analysis (unit-tested)
│   ├── matcher.js      pure correct/incorrect state machine (unit-tested)
│   ├── useMicrophone.js    getUserMedia + AudioContext lifecycle
│   └── usePitchDetection.js  the rAF loop
├── components/         Vue SFCs
└── stores/             Pinia: settings and per-note stats (localStorage)
```

## Fingering diagrams

Each note has its own SVG file under **`public/fingerings/12_hole/`**, one file
per note, covering the front and back of the instrument. They are meant to be
redrawn by hand — edit them directly, no rebuild needed.

```
public/fingerings/12_hole/
├── A4.svg  B4.svg  C5.svg  D5.svg  E5.svg  F5.svg  G5.svg
├── A5.svg  B5.svg  C6.svg  D6.svg  E6.svg  F6.svg
└── base.svg            (or any other name — templates are ignored by the app)
```

Only naturals have diagrams, which conveniently means a filename is just the
note name: no accidental to spell out, and no `#` to collide with a URL
fragment. The directory is namespaced by instrument, so a 6-hole or double
ocarina can sit alongside under its own key later.

### Redrawing one

**The app inlines whatever SVG it finds**, so redraw a diagram however you
like — any size, style or tool. A file whose name is not a note (`base.svg`,
scratch templates) is ignored entirely by both the app and the tests.

The current diagrams are drawn in Inkscape from `base.svg`. Two conventions
they follow, which the test suite relies on:

- **Every hole carries an id** — `leftPointer`, `rightSub`, `leftThumb`, and so
  on. Inkscape's Object Properties dialog has both an *ID* and a *Label* field;
  the drawings set the **Label** (`Left Pointer`, …), and
  `npm run tag:holes -- --write` derives the id from it. Re-run that after
  adding a hole or changing a label. It only ever rewrites `id` attributes.
- **Black fill means covered, white means open.** That is what lets the tests
  check each drawing against the fingering table.

Together those give a real safety net: `npm test` asserts every diagram draws
each of its twelve holes in the state the table calls for, so a mis-coloured
hole fails the suite by name (`D5: rightPinky is drawn closed, table says
open`) rather than quietly teaching the wrong fingering. If the palette
changes, update `FILL_STATE` in `test/fingering-files.test.js`.

Optionally, `var(--ink)` and `var(--surface)` follow the app's light/dark theme,
because files are inlined rather than loaded as `<img>`. Hardcoded colours work
fine too; they just look the same in both themes.

While iterating, the **Fingerings** tab has a *Reload diagrams* button that
re-fetches without a full page reload, and prints the filename under each note.

| Command | What it does |
| --- | --- |
| `npm run tag:holes` | Report which hole ids would change (dry run) |
| `npm run tag:holes -- --write` | Write hole ids, derived from `inkscape:label` |
| `npm run render:fingerings` | Write any **missing** files. Never overwrites an existing one. |
| `npm run render:fingerings -- --force` | Regenerate all, **discarding hand edits** |
| `npm run check:fingerings` | Verify every note has a file; non-zero exit if not |

`npm test` also parses every file as real XML and checks it has an `<svg>` root
with a viewBox — a stray `--` inside an XML comment or an unescaped `&` takes
the whole file down, and the browser is a poor place to discover that.

### Where the data came from

`src/music/fingerings.js` holds the thirteen naturals from A4 to F6 as 12 named
holes each. It was cross-checked against two independent open-source fingering
charts whose hole orderings differ; the mapping between them was solved from the
column signatures across all 21 chromatic notes, then every note compared.
**The two agree on every one of the thirteen naturals.**

They were compared across the accidentals too, and disagreed on exactly one
note — D♯5/E♭5, where each picks a different one of two valid alternate
fingerings. The accidental rows are not carried here, but are mechanically
re-derivable from those two sources if chromatic practice is ever wanted.

> Makers do vary. Compare against the chart that came with your instrument
> before trusting it.

## Notes on the browser

**Android Chrome mangles microphone audio by default.** Its processing chain is
built for speech: noise suppression treats a sustained pure tone as stationary
noise and attenuates it, and AGC pumps the level. `useMicrophone.js` disables
all three — and note that Chrome ties AGC to the `echoCancellation` flag, so
setting `autoGainControl` alone is ignored.

**VexFlow 5 fetches fonts from a CDN by default**, which would leave the
installed PWA unable to draw a staff offline. The app imports `vexflow/bravura`,
which bundles Bravura and Academico into the JS as base64. Nothing is fetched at
runtime.

## Settings

| Setting | Default |
| --- | --- |
| Practice range | A4–F5 (naturals, up to A4–F6) |
| Tolerance | ±50 cents |
| Hold for | 200 ms |
| Fingering hint | Note name after 2.5 s, fingering after 5 s |
| Clarity threshold | 0.85 (advanced) |
| Noise gate | −45 dB (advanced) |

Everything persists to `localStorage`. The **Advanced** section has a detector
readout showing live Hz, cents, clarity and input level — useful if a device is
ignoring the audio constraints above.
