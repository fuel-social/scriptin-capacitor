# scriptin-capacitor

Editor code for scriptin Machine.

The Bubble element htmlCapacitor (app fuel-social, page scriptin) keeps only the theme colors as dynamic expressions in `window.SM_THEME` and loads these files via jsDelivr from a version tag:

- `capacitor.css`: editor styles
- `capacitor.js`: editor script (CodeMirror 5.65.16)

To release a change: commit, create a new tag (v1.0.1, v1.1.0, ...), then change the tag in the two links inside htmlCapacitor.
