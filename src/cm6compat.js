// CodeMirror 5 style editor object on top of CodeMirror 6.
//
// The scriptin editor logic (src/editor.js) was written against CodeMirror 5. This layer gives it the same calls and
// the same order of events on CodeMirror 6, which draws only the lines in and near the window (so a script of 500 pages
// types as fast as one of 3):
//   positions {line, ch} counted from 0; getLine, lineCount, replaceRange, setCursor, operation, markText ...
//   events: beforeChange (cancel / update), inputRead, cursorActivity, changes (one list per operation), update, mousedown
//   undo history with CodeMirror 5's grouping (one step per operation, typing joined for 1.25 s)
//   line classes ('wrap' and 'text' as one class list on the line) and a per line token function for marks
import {EditorState, EditorSelection, Annotation, StateField, StateEffect, Compartment, Prec, RangeSetBuilder} from '@codemirror/state';
import {EditorView, Decoration, ViewPlugin, keymap, drawSelection, runScopeHandlers} from '@codemirror/view';
import {standardKeymap} from '@codemirror/commands';

export var Pass = {toString: function(){ return 'CodeMirror.Pass'; }};
export function cmpPos(a, b){ return a.line - b.line || a.ch - b.ch; }
export function changeEnd(c){
  if (!c.text) return c.to;
  var last = c.text.length - 1;
  return {line: c.from.line + last, ch: c.text[last].length + (last ? 0 : c.from.ch)};
}

var originAnn = Annotation.define();      // the CodeMirror 5 origin of a change ('+input', '+delete', 'undo', ...)
var noHistory = Annotation.define();      // changes that do not go into the undo history
var setHidden = StateEffect.define();     // the collapsed (hidden) ranges, given anew
var redraw = StateEffect.define();        // line classes or tokens changed: draw the visible lines again

var HISTORY_DELAY = 1250;                  // CodeMirror 5's historyEventDelay

function cm6Key(name){
  // 'Shift-Ctrl-9', 'Cmd-Alt-.', 'Up', 'Esc' (CodeMirror 5) to CodeMirror 6 key names
  var parts = name.split('-'), key = parts.pop();
  if (key === '' ){ key = '-'; parts.pop(); }
  var map = {Up:'ArrowUp', Down:'ArrowDown', Left:'ArrowLeft', Right:'ArrowRight', Esc:'Escape'};
  key = map[key] || key;
  parts = parts.map(function(p){ return p === 'Cmd' ? 'Meta' : p; });
  return parts.concat([key]).join('-');
}

export function createEditor(host, opts){
  var handlers = {}, view = null;
  var depth = 0, processing = false, opId = 0, curOp = 0;
  var pend = {changes: [], inputs: [], cursor: false, hidden: false, redraw: false};
  var version = 0, valueCache = null, valueVersion = -1;
  var wrapCls = [], textCls = [];              // line classes by line number
  var markers = [];                            // markText results, in document offsets
  var hist = {done: [], undone: [], lastOp: -1, lastOrigin: null, lastTime: 0};
  var readOnlyComp = new Compartment(), keysComp = new Compartment();
  var extraKeys = {};
  var lineTokens = opts.lineTokens || null;

  function on(type, f){ (handlers[type] || (handlers[type] = [])).push(f); }
  function fire(type){
    var hs = handlers[type];
    if (!hs) return;
    var args = [cm].concat([].slice.call(arguments, 1));
    for (var i = 0; i < hs.length; i++) hs[i].apply(null, args);
  }

  // ---- positions ----
  // Inside an operation the transactions are only collected (the state moves on, the view does not); at its end the
  // view takes them all in one update, so a keystroke that changes text, cursor and line classes draws once
  var queue = [], cstate = null;
  function cur(){ return cstate || view.state; }
  function doc(){ return cur().doc; }
  function apply(spec){
    startOp();
    try { var tr = cur().update(spec); queue.push(tr); cstate = tr.state; afterTr(tr); return tr; }
    finally { endOp(); }
  }
  function flush(){
    if (!queue.length) return;
    var q = queue; queue = []; cstate = null;
    view.update(q);
  }
  // as CodeMirror 5's clipPos: before the first line is its start, after the last line is the end of the last line
  function clip(p){
    var n = doc().lines;
    if (p.line < 0) return {line: 0, ch: 0};
    if (p.line > n - 1) return {line: n - 1, ch: doc().line(n).length};
    var line = p.line, l = doc().line(line + 1);
    return {line: line, ch: Math.max(0, Math.min(p.ch === undefined ? l.length : p.ch, l.length))};
  }
  function toOff(p, d){
    d = d || doc();
    var n = d.lines, line = Math.max(0, Math.min(p.line, n - 1)), l = d.line(line + 1);
    if (p.line > n - 1) return d.length;
    if (p.line < 0) return 0;
    return l.from + Math.max(0, Math.min(p.ch === undefined ? l.length : p.ch, l.length));
  }
  function toPos(off, d){ d = d || doc(); var l = d.lineAt(off); return {line: l.number - 1, ch: off - l.from}; }

  // ---- operations and events ----
  function startOp(){ if (depth++ === 0 && !processing) curOp = ++opId; }
  function endOp(){
    if (--depth > 0 || processing) return;
    processing = true;
    try {
      // as in CodeMirror 5: input events and cursor activity first (they may change the text again), then 'changes'
      var guard = 0;
      while ((pend.inputs.length || pend.cursor) && guard++ < 100){
        while (pend.inputs.length){ var c = pend.inputs.shift(); depth++; try { fire('inputRead', c); } finally { depth--; } }
        if (pend.cursor){ pend.cursor = false; depth++; try { fire('cursorActivity'); } finally { depth--; } }
      }
    } finally { processing = false; }
    var list = pend.changes;
    pend.changes = [];
    // after the operation, as in CodeMirror 5: what the handlers change are operations of their own
    if (list.length) fire('changes', list);
    // 'changes' handlers may have changed the text again, with their own events; then the view is told what to draw
    if (depth === 0 && (pend.inputs.length || pend.cursor || pend.changes.length)){ startOp(); endOp(); }
    if (depth === 0 && (pend.hidden || pend.redraw)){
      var effects = [];
      if (pend.hidden){ pend.hidden = false; effects.push(setHidden.of(hiddenSet())); }
      if (pend.redraw){ pend.redraw = false; effects.push(redraw.of(null)); }
      depth++;
      try { apply({effects: effects}); } finally { depth--; }
    }
    if (depth === 0) flush();
  }
  function operation(f){ startOp(); try { return f(); } finally { endOp(); } }

  function originOf(tr){
    var o = tr.annotation(originAnn);
    if (o !== undefined) return o;
    if (tr.isUserEvent('input.type.compose')) return '*compose';
    if (tr.isUserEvent('input.type')) return '+input';
    if (tr.isUserEvent('input.paste')) return 'paste';
    if (tr.isUserEvent('input.drop')) return 'drag';
    if (tr.isUserEvent('input')) return '+input';
    if (tr.isUserEvent('delete')) return '+delete';
    if (tr.isUserEvent('move')) return '+move';
    return undefined;
  }
  // CodeMirror 5 change objects of a transaction, in an order where each one's positions hold after the ones before it
  function changeObjs(tr, origin){
    var out = [], d = tr.startState.doc;
    tr.changes.iterChanges(function(fA, tA, fB, tB, ins){
      out.push({from: toPos(fA, d), to: toPos(tA, d), text: ins.toString().split('\n'), removed: d.sliceString(fA, tA).split('\n'), origin: origin});
    });
    return out.reverse();
  }
  function shiftClasses(c){
    var F = c.from.line, T = c.to.line, A = c.text.length - 1, add = [];
    for (var i = 0; i < A; i++) add.push(undefined);
    wrapCls.splice.apply(wrapCls, [F + 1, T - F].concat(add));
    textCls.splice.apply(textCls, [F + 1, T - F].concat(add));
  }
  function selKey(s, d){ return s.ranges.map(function(r){ var a = toPos(r.anchor, d), h = toPos(r.head, d); return a.line + ':' + a.ch + '-' + h.line + ':' + h.ch; }).join(','); }

  function afterTr(tr){
    var origin = originOf(tr);
    if (tr.docChanged){
      version++;
      var objs = changeObjs(tr, origin);
      objs.forEach(shiftClasses);
      markers.forEach(function(m){
        if (!m.live) return;
        m.from = tr.changes.mapPos(m.from, m.inclusiveLeft ? -1 : 1);
        m.to = tr.changes.mapPos(m.to, m.inclusiveRight ? 1 : -1);
        if (m.to <= m.from){ m.live = false; pend.hidden = pend.hidden || m.collapsed; }
      });
      pend.changes.push.apply(pend.changes, objs);
      if (!tr.annotation(noHistory)) record(tr, origin);
      // inputRead only for text the writer typed or pasted (as CodeMirror 5), never for changes made in code
      if (tr.annotation(originAnn) === undefined && (tr.isUserEvent('input.type') || tr.isUserEvent('input.paste'))) objs.forEach(function(c){ pend.inputs.push(c); });
    }
    if (tr.docChanged || tr.selection){
      // cursor activity when the cursor or selection now stands elsewhere (line and character), as in CodeMirror 5
      if (selKey(tr.startState.selection, tr.startState.doc) !== selKey(tr.state.selection, tr.state.doc)) pend.cursor = true;
    }
  }

  function dispatchTransactions(trs){
    startOp();
    try {
      for (var i = 0; i < trs.length; i++){
        if (trs[i].startState !== cur()){ if (window.console) console.warn('scriptin: editor transaction out of order, skipped'); continue; }
        queue.push(trs[i]); cstate = trs[i].state; afterTr(trs[i]);
      }
      // a cursor inside hidden text goes to its end
      var sel = cur().selection.main;
      if (sel.empty){
        for (var k = 0; k < markers.length; k++){
          var m = markers[k];
          if (m.live && m.collapsed && sel.head > m.from && sel.head < m.to){
            apply({selection: EditorSelection.cursor(m.to)});
            break;
          }
        }
      }
    } finally { endOp(); }
  }

  // ---- undo history (CodeMirror 5 rules) ----
  function record(tr, origin){
    if (origin === 'undo' || origin === 'redo') return;
    var now = Date.now(), inv = tr.changes.invert(tr.startState.doc), last = hist.done[hist.done.length - 1];
    var join = last && (hist.lastOp === curOp || (hist.lastOrigin === origin && origin && ((origin.charAt(0) === '+' && hist.lastTime > now - HISTORY_DELAY) || origin.charAt(0) === '*')));
    if (join){
      last.changes = last.changes.compose(tr.changes);
      last.inverse = inv.compose(last.inverse);
      last.selAfter = tr.state.selection;
    } else {
      hist.done.push({changes: tr.changes, inverse: inv, selBefore: tr.startState.selection, selAfter: tr.state.selection});
      if (hist.done.length > 1000) hist.done.shift();
    }
    hist.undone = [];
    hist.lastOp = curOp; hist.lastOrigin = origin; hist.lastTime = now;
  }
  function undo(){
    var ev = hist.done.pop();
    if (!ev) return;
    hist.undone.push(ev);
    apply({changes: ev.inverse, selection: ev.selBefore, annotations: [originAnn.of('undo'), noHistory.of(true)], scrollIntoView: true});
    hist.lastOp = -1; hist.lastOrigin = null;
  }
  function redo(){
    var ev = hist.undone.pop();
    if (!ev) return;
    hist.done.push(ev);
    apply({changes: ev.changes, selection: ev.selAfter, annotations: [originAnn.of('redo'), noHistory.of(true)], scrollIntoView: true});
    hist.lastOp = -1; hist.lastOrigin = null;
  }

  // ---- beforeChange and read only text ----
  function filter(tr){
    if (!tr.docChanged) return tr;
    var origin = originOf(tr), editsHidden = origin !== 'undo' && origin !== 'redo' && origin !== 'setValue' && origin !== '+restore';
    var hs = handlers.beforeChange || [], specs = [], cancelled = false, updated = false, d = tr.startState.doc;
    tr.changes.iterChanges(function(fA, tA, fB, tB, ins){ specs.push({from: fA, to: tA, insert: ins.toString()}); });
    var out = [], ro = editsHidden ? markers.filter(function(m){ return m.live && m.readOnly; }) : [];
    for (var i = 0; i < specs.length && !cancelled; i++){
      var s = specs[i];
      var ch = {from: toPos(s.from, d), to: toPos(s.to, d), text: s.insert.split('\n'), origin: origin, canceled: false,
        cancel: function(){ this.canceled = true; },
        update: function(from, to, text){ if (from) this.from = from; if (to) this.to = to; if (text) this.text = text; this.updatedFlag = true; }};
      // extra fields a handler sets (smKeep) stay on this object for the handlers after it
      for (var k = 0; k < hs.length && !ch.canceled; k++) hs[k](cm, ch);
      if (ch.canceled){ cancelled = true; break; }
      if (ch.updatedFlag) updated = true;
      var f = toOff(ch.from, d), t = toOff(ch.to, d), ins = ch.text.join('\n');
      // as CodeMirror 5: a change over read only text is split around it, the new text goes into the first part
      var parts = [{from: f, to: t}];
      ro.forEach(function(m){
        for (var j = 0; j < parts.length; j++){
          var p = parts[j];
          if (p.to < m.from || p.from > m.to) continue;
          var np = [];
          if (p.from < m.from || (!m.inclusiveLeft && p.from === m.from)) np.push({from: p.from, to: m.from});
          if (p.to > m.to || (!m.inclusiveRight && p.to === m.to)) np.push({from: m.to, to: p.to});
          parts.splice.apply(parts, [j, 1].concat(np));
          j += np.length - 1;
        }
      });
      if (parts.length !== 1 || parts[0].from !== f || parts[0].to !== t) updated = true;
      parts.forEach(function(p, x){
        var text = x ? '' : ins;
        if (p.from === p.to && !text) return;
        out.push({from: p.from, to: p.to, insert: text});
      });
    }
    if (!cancelled && updated && !out.length) return [];
    if (cancelled) return [];
    if (!updated) return tr;
    // the changed change: the selection follows it like in CodeMirror 5 (a cursor inside or at the end of it goes to its end)
    out.sort(function(x, y){ return x.from - y.from; });
    var changes = tr.startState.changes(out.map(function(o){ return {from: o.from, to: o.to, insert: o.insert}; }));
    var sel = tr.startState.selection.ranges.map(function(r){
      function adj(p){
        for (var j = 0; j < out.length; j++){ var o = out[j]; if (p >= o.from && p <= o.to) return changes.mapPos(o.from, -1) + o.insert.length; }
        return changes.mapPos(p, 1);
      }
      return EditorSelection.range(adj(r.anchor), adj(r.head));
    });
    return {changes: changes, selection: EditorSelection.create(sel), annotations: [originAnn.of(origin)].concat(tr.annotation(noHistory) ? [noHistory.of(true)] : []), scrollIntoView: tr.scrollIntoView, effects: tr.effects};
  }

  // ---- hidden (collapsed) text ----
  function hiddenSet(){
    var b = new RangeSetBuilder(), list = markers.filter(function(m){ return m.live && m.collapsed && m.to > m.from; }).sort(function(a, c){ return a.from - c.from; });
    var lastTo = -1;
    list.forEach(function(m){ if (m.from >= lastTo){ b.add(m.from, m.to, Decoration.replace({})); lastTo = m.to; } });
    return b.finish();
  }
  var hiddenField = StateField.define({
    create: function(){ return Decoration.none; },
    update: function(v, tr){
      for (var i = 0; i < tr.effects.length; i++) if (tr.effects[i].is(setHidden)) return tr.effects[i].value;
      return tr.docChanged ? v.map(tr.changes) : v;
    },
    provide: function(f){ return [EditorView.decorations.from(f), EditorView.atomicRanges.of(function(v){ return v.state.field(f); })]; }
  });
  function markText(from, to, o){
    var m = {from: toOff(from), to: toOff(to), collapsed: !!o.collapsed, readOnly: !!o.readOnly, inclusiveLeft: !!o.inclusiveLeft, inclusiveRight: !!o.inclusiveRight, live: true};
    markers.push(m);
    if (m.collapsed) pend.hidden = true;
    if (depth === 0) { startOp(); endOp(); }
    return {
      find: function(){ return m.live ? {from: toPos(m.from), to: toPos(m.to)} : undefined; },
      clear: function(){ if (!m.live) return; m.live = false; var i = markers.indexOf(m); if (i >= 0) markers.splice(i, 1); if (m.collapsed){ pend.hidden = true; if (depth === 0){ startOp(); endOp(); } } }
    };
  }

  // ---- line classes and tokens, drawn for the visible lines only ----
  function addLineClass(ln, where, cls){
    var a = where === 'wrap' ? wrapCls : textCls, cur = a[ln] || '';
    if ((' ' + cur + ' ').indexOf(' ' + cls + ' ') < 0) a[ln] = cur ? cur + ' ' + cls : cls;
    pend.redraw = true;
    if (depth === 0){ startOp(); endOp(); }
  }
  function removeLineClass(ln, where){
    var a = where === 'wrap' ? wrapCls : textCls;
    if (a[ln] !== undefined){ a[ln] = undefined; pend.redraw = true; }
    if (depth === 0){ startOp(); endOp(); }
  }
  function lineClass(ln, where){ return (where === 'wrap' ? wrapCls : textCls)[ln] || ''; }
  var markCache = {};
  function mark(cls){ return markCache[cls] || (markCache[cls] = Decoration.mark({class: cls})); }
  var lineDecoCache = {};
  function lineDeco(cls){ return lineDecoCache[cls] || (lineDecoCache[cls] = Decoration.line({class: cls})); }
  var inner = Decoration.mark({class: 'sm-in'});
  function buildDecos(v){
    var b = new RangeSetBuilder(), d = v.state.doc, sel = v.state.selection.main, wrap = new RangeSetBuilder();
    var lines = [];
    v.visibleRanges.forEach(function(r){
      for (var pos = r.from; pos <= r.to;){
        var l = d.lineAt(pos);
        if (!lines.length || lines[lines.length - 1].number < l.number) lines.push(l);
        pos = l.to + 1;
      }
    });
    var deco = [], outer = [];
    lines.forEach(function(l){
      var n = l.number - 1, cls = [wrapCls[n], textCls[n]].filter(Boolean).join(' ');
      if (cls) deco.push({from: l.from, to: l.from, d: lineDeco(cls), line: true});
      if (l.length) outer.push({from: l.from, to: l.to});
      if (lineTokens && l.length){
        var toks = lineTokens(n, l.text);
        for (var i = 0; i < toks.length; i++){ var t = toks[i]; if (t[1] > t[0]) deco.push({from: l.from + t[0], to: l.from + t[1], d: mark(t[2])}); }
      }
    });
    // the selected text itself (CodeMirror 5's styleSelectedText)
    if (!sel.empty) deco.push({from: sel.from, to: sel.to, d: mark('sm-selectedtext'), sel: true});
    deco.sort(function(a, c){ return a.from - c.from || (a.line ? -1 : 0) - (c.line ? -1 : 0) || a.to - c.to; });
    deco.forEach(function(x){ b.add(x.from, x.to, x.d); });
    outer.forEach(function(x){ wrap.add(x.from, x.to, inner); });
    return {decorations: b.finish(), wrapper: wrap.finish()};
  }
  var drawPlugin = ViewPlugin.fromClass(class {
    constructor(v){ var r = buildDecos(v); this.decorations = r.decorations; this.wrapper = r.wrapper; }
    update(u){ if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.some(function(t){ return t.effects.some(function(e){ return e.is(redraw) || e.is(setHidden); }); })){ var r = buildDecos(u.view); this.decorations = r.decorations; this.wrapper = r.wrapper; } }
  }, {decorations: function(p){ return p.decorations; }});
  // every line's text inside one span (CodeMirror 5 had one per line): shots and transitions draw their block on it.
  // Lowest precedence, so it is the outermost element around the line's other marks
  var wrapperDecos = EditorView.decorations.of(function(v){ var p = v.plugin(drawPlugin); return p ? p.wrapper : Decoration.none; });

  // CodeMirror 5's newlineAndIndent without a mode: a line break ('+input'), then the new line takes the indentation of
  // the line above in place of its own leading spaces; a cursor in those spaces goes to their end
  function newlineAndIndent(){
    operation(function(){
      var r = cur().selection.main;
      cm.replaceRange('\n', toPos(r.anchor), toPos(r.head), '+input');
      var ln = cm.getCursor().line, prev = ln > 0 ? cm.getLine(ln - 1) : '', text = cm.getLine(ln);
      var col = 0, want, have = /^\s*/.exec(text)[0];
      for (var i = 0; i < prev.length && /\s/.test(prev.charAt(i)); i++) col = prev.charAt(i) === '\t' ? col + 4 - col % 4 : col + 1;
      want = new Array(col + 1).join(' ');
      if (want !== have){
        var c = cm.getCursor(), inWs = c.line === ln && c.ch <= have.length;
        cm.replaceRange(want, {line: ln, ch: 0}, {line: ln, ch: have.length}, '+input');
        if (inWs) cm.setCursor({line: ln, ch: want.length});
      }
    });
    return true;
  }

  // ---- keys ----
  function keyBindings(){
    var out = [];
    Object.keys(extraKeys).forEach(function(name){
      var f = extraKeys[name], run;
      if (typeof f === 'string') run = f === 'newlineAndIndent' ? newlineAndIndent : function(){ return false; };
      else run = function(){ var r; operation(function(){ r = f(cm); }); return r !== Pass; };
      out.push({key: cm6Key(name), run: run, preventDefault: true});
    });
    return out;
  }
  var historyKeys = [
    {key: 'Mod-z', run: function(){ operation(undo); return true; }, preventDefault: true},
    {key: 'Mod-Shift-z', run: function(){ operation(redo); return true; }, preventDefault: true},
    {key: 'Mod-y', run: function(){ operation(redo); return true; }, preventDefault: true}
  ];
  // Enter in CodeMirror 5 without a mode keeps the line's indent
  var baseKeys = standardKeymap.map(function(b){ return b.key === 'Enter' ? {key: 'Enter', run: newlineAndIndent} : b; });

  var update = EditorView.updateListener.of(function(u){
    if (u.docChanged || u.viewportChanged || u.geometryChanged || u.heightChanged){
      u.view.requestMeasure({key: 'sm-update', read: function(){ fire('update'); }});
    }
  });

  var state = EditorState.create({
    doc: opts.value || '',
    extensions: [
      readOnlyComp.of(EditorState.readOnly.of(!!opts.readOnly)),
      Prec.highest(keysComp.of(keymap.of([]))),
      keymap.of(historyKeys),
      keymap.of(baseKeys),
      EditorView.lineWrapping,
      drawSelection({cursorBlinkRate: 0}),
      EditorState.transactionFilter.of(filter),
      hiddenField,
      drawPlugin,
      Prec.lowest(wrapperDecos),
      update,
      EditorState.allowMultipleSelections.of(false)
    ]
  });
  view = new EditorView({state: state, parent: host, dispatchTransactions: function(trs){ dispatchTransactions(trs); }});
  view.dom.addEventListener('mousedown', function(e){ fire('mousedown', e); });

  var cm = {
    view: view,
    on: on,
    operation: operation,
    getLine: function(n){ return n < 0 || n >= doc().lines ? undefined : doc().line(n + 1).text; },
    lineCount: function(){ return doc().lines; },
    lastLine: function(){ return doc().lines - 1; },
    getValue: function(){ if (valueVersion !== version){ valueCache = doc().toString(); valueVersion = version; } return valueCache; },
    setValue: function(text){
      operation(function(){
        apply({changes: {from: 0, to: doc().length, insert: text}, selection: EditorSelection.cursor(0), annotations: [originAnn.of('setValue')]});
      });
    },
    replaceRange: function(text, from, to, origin){
      from = clip(from); to = to ? clip(to) : from;
      if (cmpPos(to, from) < 0){ var t = from; from = to; to = t; }
      var f = toOff(from), e = toOff(to), dl = text.length - (e - f);
      var sel = cur().selection.ranges.map(function(r){
        function adj(p){ return p < f ? p : p <= e ? f + text.length : p + dl; }
        return EditorSelection.range(adj(r.anchor), adj(r.head));
      });
      operation(function(){
        apply({changes: {from: f, to: e, insert: text}, selection: EditorSelection.create(sel), annotations: origin !== undefined ? [originAnn.of(origin)] : []});
      });
    },
    getRange: function(from, to){ return cur().sliceDoc(toOff(clip(from)), toOff(clip(to))); },
    getCursor: function(which){
      var r = cur().selection.main;
      var off = which === 'anchor' ? r.anchor : which === 'from' || which === 'start' ? r.from : which === 'to' || which === 'end' ? r.to : r.head;
      return toPos(off);
    },
    setCursor: function(pos, ch, o){
      if (typeof pos === 'number') pos = {line: pos, ch: ch};
      else o = ch;
      var off = toOff(clip(pos));
      operation(function(){ apply({selection: EditorSelection.cursor(off), scrollIntoView: !(o && o.scroll === false)}); });
    },
    setSelection: function(anchor, head, o){
      var a = toOff(clip(anchor)), h = toOff(clip(head || anchor));
      operation(function(){ apply({selection: EditorSelection.single(a, h), scrollIntoView: !(o && o.scroll === false)}); });
    },
    listSelections: function(){ return cur().selection.ranges.map(function(r){ return {anchor: toPos(r.anchor), head: toPos(r.head)}; }); },
    somethingSelected: function(){ return cur().selection.ranges.some(function(r){ return !r.empty; }); },
    replaceSelection: function(text, collapse, origin){
      var r = cur().selection.main, from = toPos(r.from), to = toPos(r.to);
      operation(function(){
        cm.replaceRange(text, from, to, origin);
        var end = toOff(changeEnd({from: from, to: to, text: text.split('\n')}));
        if (collapse === 'start') apply({selection: EditorSelection.cursor(toOff(from))});
        else if (collapse === 'around') apply({selection: EditorSelection.single(toOff(from), end)});
        else apply({selection: EditorSelection.cursor(end)});
      });
    },
    getSelection: function(){ var r = cur().selection.main; return cur().sliceDoc(r.from, r.to); },
    indexFromPos: function(p){ return toOff(clip(p)); },
    posFromIndex: function(i){ return toPos(Math.max(0, Math.min(i, doc().length))); },
    markText: markText,
    addLineClass: addLineClass,
    removeLineClass: removeLineClass,
    lineClass: lineClass,
    // a line as CodeMirror 5 described it (a copy: text and classes now)
    getLineHandle: function(n){ var t = cm.getLine(n); return t === undefined ? null : {text: t, wrapClass: lineClass(n, 'wrap') || undefined, textClass: lineClass(n, 'text') || undefined}; },
    // the marks of a line as CodeMirror 5's tokens ({string, type}, type without the cm- prefix)
    getLineTokens: function(n){
      var t = cm.getLine(n), toks = lineTokens ? lineTokens(n, t) : [];
      return toks.map(function(x){ return {start: x[0], end: x[1], string: t.slice(x[0], x[1]), type: x[2].split(' ').map(function(c){ return c.replace(/^cm-/, ''); }).join(' ')}; });
    },
    getAllMarks: function(){ return markers.filter(function(m){ return m.live; }); },
    signal: function(type){ fire.apply(null, arguments); },
    eachLine: function(f){ var it = doc().iterLines(); for (var n = 0; !it.next().done; n++) f({text: it.value}, n); },
    focus: function(){ flush(); view.focus(); },
    hasFocus: function(){ return view.hasFocus; },
    getWrapperElement: function(){ return view.dom; },
    getInputField: function(){ return view.contentDOM; },
    setOption: function(name, value){
      if (name === 'readOnly') apply({effects: readOnlyComp.reconfigure(EditorState.readOnly.of(!!value))});
      else if (name === 'extraKeys'){ extraKeys = value || {}; apply({effects: keysComp.reconfigure(keymap.of(keyBindings()))}); }
    },
    execCommand: function(name){
      if (name === 'undo') operation(undo);
      else if (name === 'redo') operation(redo);
      else if (name === 'newlineAndIndent') newlineAndIndent();
      else if (name === 'selectAll') operation(function(){ apply({selection: EditorSelection.single(0, doc().length)}); });
    },
    clearHistory: function(){ hist.done = []; hist.undone = []; hist.lastOp = -1; hist.lastOrigin = null; },
    changeGeneration: function(close){ if (close){ hist.lastOp = -1; hist.lastOrigin = null; } return version; },
    historySize: function(){ return {undo: hist.done.length, redo: hist.undone.length}; },
    refresh: function(){ view.requestMeasure(); pend.redraw = true; if (depth === 0){ startOp(); endOp(); } },
    // geometry: 'local' is measured from the top of the document (the content's top edge), 'window' from the window
    charCoords: function(pos, mode){
      flush();
      var off = toOff(clip(pos)), c = view.coordsAtPos(off) || view.coordsAtPos(off, -1);
      if (!c){ var b = view.lineBlockAt(off), top = b.top; return mode === 'window' ? {top: top + view.documentTop, bottom: top + b.height + view.documentTop, left: 0, right: 0} : {top: top, bottom: top + b.height, left: 0, right: 0}; }
      if (mode === 'window') return c;
      return {top: c.top - view.documentTop, bottom: c.bottom - view.documentTop, left: c.left, right: c.right};
    },
    cursorCoords: function(pos, mode){ return cm.charCoords(pos || cm.getCursor(), mode); },
    heightAtLine: function(ln, mode){
      flush();
      var n = doc().lines, b = view.lineBlockAt(doc().line(Math.max(1, Math.min(ln + 1, n))).from);
      return mode === 'window' ? b.top + view.documentTop : b.top;
    },
    lineAtHeight: function(h, mode){
      flush();
      var y = mode === 'window' ? h - view.documentTop : h;
      return doc().lineAt(view.lineBlockAtHeight(y).from).number - 1;
    },
    defaultTextHeight: function(){ return view.defaultLineHeight; },
    defaultCharWidth: function(){ return view.defaultCharacterWidth; },
    contentWidth: function(){ return view.contentDOM.clientWidth; },
    cursorElement: function(){ flush(); return view.dom.querySelector('.cm-cursor'); },
    version: function(){ return version; },
    // f runs when the editor next reads its layout (once, however often it is asked for before)
    afterLayout: function(f){ var k = f.smKey || (f.smKey = {}); view.requestMeasure({key: k, read: function(){ f(); }}); },
    // keys and typing as the browser delivers them (used by the tests)
    triggerOnKeyDown: function(e){
      var ev = new (host.ownerDocument.defaultView.KeyboardEvent)('keydown', {key: e.key, code: e.code || '', ctrlKey: !!e.ctrlKey, shiftKey: !!e.shiftKey, altKey: !!e.altKey, metaKey: !!e.metaKey, bubbles: true, cancelable: true});
      if (e.keyCode) try { Object.defineProperty(ev, 'keyCode', {get: function(){ return e.keyCode; }}); } catch (x){}
      flush();
      runScopeHandlers(view, ev, 'editor');
    },
    typeText: function(text){
      flush();
      var r = view.state.selection.main;
      view.dispatch({changes: {from: r.from, to: r.to, insert: text}, selection: EditorSelection.cursor(r.from + text.length), userEvent: 'input.type', scrollIntoView: true});
    }
  };
  return cm;
}
