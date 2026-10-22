# scriptin-capacitor

Editor code for scriptin Machine.

The Bubble element htmlCapacitor (app fuel-social, page scriptin) keeps only the theme colors as dynamic expressions in `window.SM_THEME` and loads these files via jsDelivr from a fixed commit:

- `capacitor.css`: editor styles
- `capacitor.js`: editor script (CodeMirror 5.65.16)

To release a change: commit and push, then replace the commit hash in the variable `B` inside htmlCapacitor.
