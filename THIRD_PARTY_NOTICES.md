# Third-party notices

## Audio

The sixteen WAV files in `public/audio/breaks/` and `public/audio/repair/` are original synthesized effects created for Procedural Rock Lab. They contain no purchased sound-library recordings or other third-party samples. The generator, `scripts/generate-public-audio.mjs`, and its generated public audio are included under the project's MIT license. See [public audio provenance](docs/audio-provenance.json) for synthesis details and file hashes.

The four-note restore chime is synthesized directly with Web Audio; it contains no sampled recording.

A separately licensed recording bank can optionally be used during local development. It is excluded from the public repository and production build, remains subject to its original license, and is not covered by the project's MIT license. See [audio library setup](docs/AUDIO.md).

## Runtime software

| Library | License | Source |
| --- | --- | --- |
| Three.js | MIT | https://github.com/mrdoob/three.js |
| three-pinata | MIT | https://github.com/dgreenheck/three-pinata |
| Rapier | Apache-2.0 | https://github.com/dimforge/rapier |

[Full runtime license texts](public/THIRD-PARTY-LICENSES.txt) are included in the source and built site. The dependencies retain their own copyright and license terms. Development tools, including Vite and Playwright, retain the licenses distributed with their npm packages.
