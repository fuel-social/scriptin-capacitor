# scriptin-capacitor

Editor code for scriptin Machine.

The Bubble element htmlCapacitor (app fuel-social, page scriptin) holds only a small loader. It loads these files from Cloudflare Pages (project scriptin-capacitor, production branch `live`, domain scriptin.fuel.social):

- `capacitor.css`: editor styles
- `capacitor.js`: editor script, built from `src/` with `npm run build` (one file, CodeMirror 6 included); commit it with the sources
- `src/editor.js`: the editor logic; `src/cm6compat.js`: CodeMirror 6 with the CodeMirror 5 style calls and events the logic uses (only the lines near the window are drawn)
- `src/fdx.js`: Final Draft (.fdx) import, read into scriptin's markup; a file dropped on the page replaces the script (first three pages, Cmd+Z undoes it). Test files in `test/fdx/`
- `vendor/`, `fonts/`: jsPDF and Courier Prime for the PDF export, loaded on the first export
- `_headers`: lets fuel.social load the fonts and scripts (CORS)

To release a change: run `npm test` (it builds `capacitor.js` first), commit, push to `main`, test with `?cap=<commit>` (loads that commit from jsDelivr in that tab only), then move `live` to the commit and push it. htmlCapacitor needs no change.

## Tests and performance

`npm test` runs the pagination tests, the editor tests (simulated keys in jsdom) and a random edit test (`test/pages.test.js`): hundreds of random edits on a long script, after each one the incremental page count, line classes, hidden runs, cue and slugline index and export command marks must equal a full recomputation.

`npm run visual` (also part of `npm test`) opens the editor in a real Chromium (Playwright) and measures every colour band and the cursor in many situations (selections over sluglines, shots, transitions, cues, several rows, emphasis): same height and top in every row, on whole device pixels, one piece per row, the text always above the bands. A release only goes out when it passes.

`npm run bench` loads a 510 page script (`BENCH_SCENES`, default 1700 scenes) and reports per keystroke the longest blocking piece of work in ms (CodeMirror and jsdom included). `BENCH_PLAIN=1` runs a bare CodeMirror 6 with the same text for comparison. The difference is the editor's own cost; the goal is at most 5 ms per keystroke on 500 pages.

How the editor stays fast on long scripts:

- Page count: after a change only the pages around it are laid out again (from two page starts before it, until a page start matches a known one); a change that moves every page after it lays out 4 pages at once and the rest in steps of 25 between keystrokes. Wrap results are kept.
- Line classes: only the paragraphs around a change, the empty lines beside them and the scene's slugline; whole script passes read each line once.
- Hidden runs (views, notes off, hidden title page) are only rebuilt when they change.
- Completion and the name ladder use an index of cue and slugline lines.
- Page numbers are placed from CodeMirror's height map, and only near the window.
- Reformat writes only the runs of lines that changed.
- Saving (this browser, Bubble) runs when the page is idle.
