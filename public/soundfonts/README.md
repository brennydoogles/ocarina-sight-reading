# Ocarina soundfont (bundled, offline)

`ocarina-mp3/` holds 21 MP3 files -- one per note the instrument can play,
A4 through F6 -- used by `abcjs`'s synth (via `src/audio/useSongPlayback.js`)
to play back a saved song with General MIDI's "Ocarina" voice (`ocarina` in
`instrument-index-to-name.js`, at index 79).

## Why these specific files, and not a full soundfont

`abcjs`'s synth defaults to fetching individual note samples from a CDN
(`https://paulrosen.github.io/midi-js-soundfonts/...`) on demand. That
breaks this PWA's offline story -- the same reason VexFlow's Bravura font is
base64-inlined rather than loaded from a CDN (see the README's PWA notes).
Bundling the *entire* FluidR3_GM ocarina instrument (88 notes, spanning its
full nominal range) would add ~2MB, most of it for pitches this instrument
can never play. Every song in this app's library is validated to fit inside
A4-F6 (see `validateSong` in `src/music/abc.js`), so only those 21 notes are
bundled -- about 525KB, comfortably inside `vite.config.js`'s 4MB workbox
precache cap.

## Provenance and licence

Downloaded from the `FluidR3_GM/ocarina-mp3/` directory of
https://github.com/paulrosen/midi-js-soundfonts (the same soundfont set
`abcjs` uses by default), which is MIT-licensed:

> Copyright (C) 2012 Benjamin Gleitzman (gleitz@mit.edu)
>
> Permission is hereby granted, free of charge, to any person obtaining a
> copy of this software and associated documentation files (the
> "Software"), to deal in the Software without restriction, including
> without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit
> persons to whom the Software is furnished to do so, subject to the
> following conditions:
>
> The above copyright notice and this permission notice shall be included
> in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
> OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
> MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
> NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
> USE OR OTHER DEALINGS IN THE SOFTWARE.

## Regenerating this set

If the instrument's playable range ever changes (`INSTRUMENT_LOW`/
`INSTRUMENT_HIGH` in `src/music/notes.js`), re-derive the file list from
that range and re-download, e.g.:

```bash
for note in A4 Bb4 B4 C5 Db5 D5 Eb5 E5 F5 Gb5 G5 Ab5 A5 Bb5 B5 C6 Db6 D6 Eb6 E6 F6; do
  curl -sf -o "public/soundfonts/ocarina-mp3/${note}.mp3" \
    "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/ocarina-mp3/${note}.mp3"
done
```

Note names must match `abcjs`'s own spelling exactly (flats, not sharps --
see `pitch-to-note-name.js` in the `abcjs` source) and the URL layout is
`<soundFontUrl>ocarina-mp3/<Note>.mp3`, which `soundFontUrl` in
`useSongPlayback.js` points at this directory for.
