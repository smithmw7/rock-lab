# Audio libraries

The public demo includes sixteen original synthesized WAV files: two break and two collision variants for rock, concrete, glass, and wood. They use seeded noise and damped resonances, contain no third-party samples, and are included under the project's MIT license. Playback uses the authored pitch, with collision strength controlling gain. The reset chime is synthesized directly with Web Audio.

Regenerate the public bank with:

```sh
node scripts/generate-public-audio.mjs
```

[audio-provenance.json](audio-provenance.json) records the generator, synthesis method, seed, format, measurements, and SHA-256 for every public clip. Regeneration is deterministic and never reads or changes the private bank.

## Optional private development bank

An owner's separately licensed recordings can be stored locally at `public/audio/private/breaks/` and `public/audio/private/repair/`, using the public bank's filenames. Select that bank for local development with an ignored `.env.local` file:

```dotenv
VITE_AUDIO_LIBRARY=private
```

The private bank is not required for a public checkout. Without the local setting, the app loads the public sounds. The full private recording provenance is kept locally at `local-assets/licensed-audio/audio-provenance.json` and is not distributed.

Production builds always select the public bank. The Vite build excludes `public/audio/private/`; Git excludes the private bank, local provenance, and `.env.local`. Asset URLs honor Vite's base URL, including GitHub Pages project subpaths. `audio.getState().library` identifies which bank the running app selected.

Both banks use the same gesture unlock, voice cap, variant selection, collision cooldowns, and master volume/mute controls. Public sounds preserve the interaction behavior while having their own synthesized timbre. The private recordings remain subject to their original license and are not covered by the project license.
