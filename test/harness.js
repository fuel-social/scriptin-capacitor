// The editor in jsdom for the tests: loads the built capacitor.js (npm run build) and hands back the editor object.
// jsdom does no layout, so a few browser calls are stubbed (they report nothing measured)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
module.exports = function(){
  const dom = new JSDOM('<!doctype html><div id="box"><div id="sm-editor"></div></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://fuel.social/version-test/scriptin' });
  const w = dom.window;
  const none = () => ({ length: 0, item(){ return null; }, [Symbol.iterator]: function*(){} });
  const zero = () => ({ top:0, bottom:0, left:0, right:0, height:0, width:0, x:0, y:0 });
  w.Range.prototype.getClientRects = none;
  w.Range.prototype.getBoundingClientRect = zero;
  w.HTMLElement.prototype.getClientRects = none;
  // a little layout, so CodeMirror 6 draws only the lines near the window as in a browser: each line 21 px high, the
  // editor as tall as its lines, the window 768 px
  if (process.env.SM_LAYOUT !== '0'){
    const rect = (top, h) => ({ top, bottom: top + h, left: 0, right: 720, height: h, width: 720, x: 0, y: top });
    w.HTMLElement.prototype.getBoundingClientRect = function(){
      const c = this.className || '';
      if (/\bcm-line\b/.test(c)) return rect(0, 21);
      if (/\bcm-(editor|scroller|content)\b/.test(c)){
        const v = w.document.getElementById('sm-editor').smCM;
        return rect(-(w.__scrollY || 0), v ? v.view.contentHeight : 21);
      }
      return rect(0, 0);
    };
  }
  w.scrollTo = () => {}; w.scrollBy = () => {};
  w.document.elementFromPoint = () => null;
  w.HTMLElement.prototype.scrollIntoView = function(){};
  // the editor starts at once, not on DOMContentLoaded
  Object.defineProperty(w.document, 'readyState', { get(){ return 'complete'; } });
  if (process.env.BENCH_PLAIN) return { w, cm: null };
  w.eval(fs.readFileSync(path.join(__dirname, '..', 'capacitor.js'), 'utf8'));
  const cm = w.document.getElementById('sm-editor').smCM;
  if (!cm){ console.log('no editor'); process.exit(1); }
  cm.typeText && (cm.type = function(str){ for (const ch of str) cm.typeText(ch); });
  return { w, cm };
};
