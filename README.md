# Abhinava Dance Company — website updates

This project holds the website of [abhinava.dance](https://abhinava.dance) and the robot that updates it
from the Google Sheet **ADC Website**. Editors never come here: they work in the Sheet.

| Where | What |
|---|---|
| `content/live.json` | what is live now (written by the robot after each approved publish) |
| `content/preview.json` on branch `preview` | what an editor sent with **Update preview** |
| `status/*.json` on branch `status` | the robot's answers, read by the Sheet's Website panel |
| `webupdate/` | the robot: reads the content, checks it, fetches photos from Drive, builds the site and the change page |
| `.github/workflows/` | Preview, Publish, Undo last publish, Instagram refresh |
| GitHub Pages | the preview: the full site, plus `/review/` — only what changed |

The pages, styles and scripts are developed in a separate project and copied here; editors' changes
are applied on top of them at every build, so the page files themselves are never rewritten.

Guides: [for editors](webupdate/GUIDE-EDITORS.md) · [for the owner](webupdate/GUIDE-OWNER.md)
