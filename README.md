# scriptin-capacitor

Editor code for scriptin Machine.

The Bubble element htmlCapacitor (app fuel-social, page scriptin) holds only a small loader. It loads these files from Cloudflare Pages (project scriptin-capacitor, production branch `live`, domain scriptin.fuel.social):

- `capacitor.css`: editor styles
- `capacitor.js`: editor script (CodeMirror 5.65.16)
- `vendor/`, `fonts/`: jsPDF and Courier Prime for the PDF export, loaded on the first export
- `_headers`: lets fuel.social load the fonts and scripts (CORS)

To release a change: commit, run `npm test`, push to `main`, test with `?cap=<commit>` (loads that commit from jsDelivr in that tab only), then move `live` to the commit and push it. htmlCapacitor needs no change.
