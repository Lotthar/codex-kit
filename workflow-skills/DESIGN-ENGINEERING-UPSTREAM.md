# Design and engineering skills provenance

- UI/UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill, commit 6ae86f61f520d6ca229d2f40e070410638c908c5, MIT. Seven stable skill directories are included. Paths in skill instructions are adapted for the Codex global installation; per-font licenses are retained or supplied where needed.
- Matt Pocock skills: https://github.com/mattpocock/skills, commit 5863806dd4e15c63174bee4e7515a4256792ecfa, MIT. Stable engineering and productivity skills are included with upstream explicit-only policies preserved; in-progress and misc are excluded.
- Karpathy guidelines: https://github.com/multica-ai/andrej-karpathy-skills, commit 2c606141936f1eeef17fa3043a72095b4765b9c2, MIT as declared in upstream README and skill; the repository supplies no copyright notice or license file at that revision.

Updates require reviewing a new immutable upstream revision, retaining required licenses and Codex-specific path adaptations, and running the focused installation and full validation checks. Routine setup uses these bundled copies.

Additional font notices: IBM Plex Serif from https://github.com/google/fonts/blob/main/ofl/ibmplexserif/OFL.txt (SHA-256 7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da); Instrument Serif from https://github.com/google/fonts/blob/main/ofl/instrumentserif/OFL.txt (SHA-256 129ed7618959716959f2941fdd5b49e0ad6e6c1d78726761786a00253d865521).

Codex Kit activation overlay: the seven design skills, Karpathy guidelines, and eleven formerly automatic Matt Pocock skills now set `policy.allow_implicit_invocation: false` in `agents/openai.yaml`. All original explicit names and skill bodies remain available. Kit entry points provide concise automatic guidance; preserve this metadata overlay when updating upstream copies. The sixteen upstream explicit-only skills retain their original policy.
