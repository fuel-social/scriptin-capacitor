// A locked script (published with /fuel) keeps its Mode in this browser: a reload opens it in the Mode it had.
// Run with: npm test
const { webcrypto } = require('crypto');
const harness = require('./harness');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const TOKEN = 'a'.repeat(32), KEY = webcrypto.getRandomValues(new Uint8Array(32)), KEYSTR = b64u(KEY);
const TEXT = '---\n\n//TITLE PAGE\nTitle: Laundromat\nAuthor: Fabrizio\n\n//SETTINGS\nPage size: A4\nLanguage: English\nAutocomplete: On\nMode: Day\n\n---\n\n.i LAUNDROMAT - NIGHT\n\nLena folds a shirt.\n\n/fuel LENA';
let fails = 0;
function eq2(label, got, want){ const ok = got === want; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : ' -> ' + JSON.stringify(got) + '   wanted ' + JSON.stringify(want))); }
async function payload(text){
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const k = await webcrypto.subtle.importKey('raw', KEY, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify({ t: text, at: 1 })));
  return 'v2.' + b64u(iv) + '.' + b64u(new Uint8Array(ct));
}
const wait = ms => new Promise(r => setTimeout(r, ms));
// opens the locked script from the database, with the Mode this browser kept for it (or none)
async function open(kept){
  const pl = await payload(TEXT);
  const { w, cm } = harness({
    url: 'https://fuel.social/version-test/scriptin#' + TOKEN + '.' + KEYSTR,
    before(w){
      // jsdom has no Web Crypto: the editor gets Node's, as in a browser
      Object.defineProperty(w.crypto, 'subtle', { value: webcrypto.subtle, configurable: true });
      if (!w.TextDecoder){ w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder; }
      // the colours of OptS_theme_ui light and dark, as Bubble has them
      w.app = { option_sets:{ _theme_ui:{ values:{ a:{db_value:'light', colorbackground:'#F9F9F9', colorforeground:'#1C2F42', colorblue:'#009ECE', colorframe:'#E2E2E2', colorinactive:'#929BA4', colorred:'#F2505D'},
        b:{db_value:'dark', colorbackground:'#323232', colorforeground:'#DFDFDF', colorblue:'#81C7E3', colorframe:'#454545', colorinactive:'#9B948D', colorred:'#FBA6B4'} } } } };
      if (kept) w.localStorage.setItem('scriptin.capacitor.mode.' + TOKEN, kept);
      w.bubble_fn_scriptLoad = () => setTimeout(() => w.smLoaded('yes', pl, 'yes'), 0);
    }
  });
  for (let i = 0; i < 50 && !cm.smLocked(); i++) await wait(20);
  return { w, cm };
}
const modeLine = cm => cm.getValue().split('\n').find(l => /^Mode:/.test(l));
(async function(){
  let { w, cm } = await open(null);
  eq2('locked, nothing kept: the Mode it was published with', cm.smLocked() + ' ' + modeLine(cm), 'true Mode: Day');
  // the title page is shown and Mode changed to Night: this browser keeps it under the token
  const key = (name, code, mods) => cm.triggerOnKeyDown(Object.assign({ type: 'keydown', keyCode: code, key: name, preventDefault(){}, stopPropagation(){} }, mods || {}));
  const ml = cm.getValue().split('\n').findIndex(l => /^Mode:/.test(l));
  cm.setCursor({ line: ml - 1, ch: 2 });
  if (cm.getCursor().line !== ml - 1){ key('9', 57, { ctrlKey: true, shiftKey: true }); cm.setCursor({ line: ml - 1, ch: 2 }); }
  key('Tab', 9); key('ArrowDown', 40);
  eq2('locked: Mode changed to Night', modeLine(cm), 'Mode: Night');
  eq2('locked: Night kept in this browser under the token', w.localStorage.getItem('scriptin.capacitor.mode.' + TOKEN), 'Night');
  eq2('locked: the script itself is still not saved', w.localStorage.getItem('scriptin.capacitor.text'), null);
  ({ w, cm } = await open('Night'));
  eq2('reload: the locked script opens in Night', cm.smLocked() + ' ' + modeLine(cm), 'true Mode: Night');
  eq2('reload: the editor is in night colours', w.document.getElementById('sm-editor').getAttribute('data-mode'), 'night');
  eq2('reload: the /fuel line is still emptied', cm.getValue().split('\n').some(l => /^\/fuel/.test(l)), false);
  const sw = cm.getValue().split('\n').indexOf('Lena folds a shirt.');
  cm.replaceRange('Z', { line: sw, ch: 0 }, null, '+input');
  eq2('reload: the script still cannot change', cm.getLine(sw), 'Lena folds a shirt.');
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
