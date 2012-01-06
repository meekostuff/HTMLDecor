/*
 * Copyright 2009-2011 Sean Hogan (http://meekostuff.net/)
 */

// TODO Move script and options detection outside of the decorSystem module
// Eventually logger and decorSystem could be in separate modules
// and built into this script.

(function() {

var last = function(a) { return a[a.length - 1]; }
var script = last(document.getElementsByTagName("script"));

// NOTE if HTMLDecor is included in a decor document then abort 
if (window.name == "_decor") return; 

// or if "nodecor" is one of the search options
if (/(^\?|&)nodecor($|&)/.test(location.search)) return;

var Meeko = window.Meeko || (window.Meeko = {});
var stuff = Meeko.stuff || (Meeko.stuff = {});

var forEach = ([].forEach) ? 
function(a, fn, context) { return [].forEach.call(a, fn, context); } :
function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) fn.call(context, a[i], i, a); }

var every = ([].every) ? 
function(a, fn, context) { return [].every.call(a, fn, context); } :
function(a, fn, context) { 
	for (var n=a.length, i=0; i<n; i++) {
		if (!fn.call(context, a[i], i, a)) return false; 
	}
	return true;
}

var addEvent = 
	document.addEventListener && function(node, event, fn) { return node.addEventListener(event, fn, false); } ||
	document.attachEvent && function(node, event, fn) { return node.attachEvent("on" + event, fn); } ||
	function(node, event, fn) { node["on" + event] = fn; }

var $ = function(selector, context) {
	if (!context) context = document;
	else if (context.nodeType != 9) context = context.ownerDocument;
	var m = selector.match(/^#([-_a-zA-Z0-9]+)$/);
	if (!m[0]) throw (selector + " can only be an ID selector in $()");
	var id = m[1], node = context.getElementById(id);
	if (node.id == id) return node;
	var nodeList = context.getElementsByName(id);
	for (var n=nodeList.length, i=0; i<n; i++) {
		node = nodeList[i];
		if (node.id == id) return node;
	}
}
var $$ = function(selector, context) {
	var context = context || document;
	try { return context.getElementsByTagName(selector); }
	catch (error) {
		throw (selector + " can only be a tagName selector in $$()");
	}
}

var matchesElement = function(selector, node) {
	var tagName = selector.toLowerCase();
	var matcher = function(el) {
		return (el.nodeType == 1 && el.tagName.toLowerCase() == tagName);
	}
	return (node) ? matcher(node) : matcher;
}
var firstChild = function(parent, matcher) {
	var fn = (typeof matcher == "function") ? 
		matcher : 
		matchesElement(matcher);
	var nodeList = parent.childNodes;
	for (var n=nodeList.length, i=0; i<n; i++) {
		var node = nodeList[i];
		if (fn(node)) return node;
	}
}

// FIXME what about IE versions that precede conditional comments??
var IE_VER, isIE = /*@cc_on!@*/false;
if (isIE) {
	IE_VER = 9;
	var div = document.createElement("div");
	div.innerHTML = 
		"<!--[if lte IE 6]>6<![endif]-->" + 
		"<!--[if IE 7]>7<![endif]-->" + 
		"<!--[if IE 8]>8<![endif]-->";
	if (div.innerHTML) IE_VER = 1 * div.innerHTML;
}

var logger = Meeko.stuff.logger || (Meeko.stuff.logger = new function() {

var levels = "DEBUG INFO WARN ERROR".split(" ");

forEach(levels, function(name, num) {
	
this["LOG_"+name] = num;	
this[name.toLowerCase()] = function() { this._log({ level: num, message: arguments }); }

}, this);

this.LOG_NONE = this.LOG_ERROR + 1;
this.LOG_LEVEL = this.LOG_WARN;

this._log = function(data) { 
	if (data.level < this.LOG_LEVEL) return;
	data.timeStamp = +(new Date);
        data.message = [].join.call(data.message, " ");
        if (this.write) this.write(data);
}

var startTime = +(new Date), padding = "      ";

this.write = (window.console) && function(data) { 
	var offset = padding + (data.timeStamp - startTime), 
		first = offset.length-padding.length-1,
		offset = offset.substring(first);
	console.log(offset+"ms " + levels[data.level]+": " + data.message); 
}

}); // end logger defn


var decorSystem = Meeko.stuff.decorSystem || (Meeko.stuff.decorSystem = new function() {

var sys = this;

// NOTE resolveURL shouldn't be needed, or at least
// el.setAttribute(attr, el[attr]) should suffice.
// But IE doesn't return relative URLs for <link>, and
// does funny things on anchors
// FIXME might be able to refactor to only resolve for <link>
var resolveURL = (!isIE || IE_VER >= 8) ? 
function(relURL, context) { 
	if (!context) context = document;
	var a = context.createElement("a");
	a.setAttribute("href", relURL);
	return a.href;
} :
function(relURL, context) { 
	if (!context) context = document;
	var a = context.createElement('<a href="'+ relURL + '" />');
	if (context == document) return a.href;
	context.body.appendChild(a);
	var href = a.href;
	context.body.removeChild(a);
	return href;
}

var setReadyState = function(state) {
	sys.readyState = state;
	logger.debug("readyState: ", state);
}
setReadyState("uninitialized");

var readyStateLookup = {
	"uninitialized": false,
	"loading": false,
	"interactive": false,
	"loaded": true, // TODO is this correct??
	"complete": true
}

var head, body, style, lastDecorNode, fragment, iframe, decorLink, decorHREF, decorURL, decorDocument;

var loaded = false;
if (!document.readyState) {
	addEvent(document, "DOMContentLoaded", function() { loaded = true; });
	addEvent(window, "load", function() { loaded = true; });
}
var domContentLoaded = this.domContentLoaded = function() { 
	return loaded || readyStateLookup[document.readyState];
}

head = document.head || firstChild(document.documentElement, "head");
function findDecorLink() {
	if (decorLink) return;
	decorLink = firstChild(head, function(el) {
		return el.nodeType == 1 &&
			el.tagName.toLowerCase() == "link" &&
			/\bMEEKO-DECOR\b/i.test(el.rel);
	});
	if (!decorLink) return;
	decorHREF = decorLink.href;
	decorURL = resolveURL(decorHREF);
	return decorLink;
}
	
fragment = document.createDocumentFragment();
style = document.createElement("style");
fragment.appendChild(style); // NOTE on IE this realizes style.styleSheet 

// NOTE hide the page until the decor is ready
// FIXME this should have a configurable timeout so slow loading
// doesn't leave the window blank
if (style.styleSheet) style.styleSheet.cssText = "body { visibility: hidden; }";
else style.textContent = "body { visibility: hidden; }";
var hidden = false;
function unhide() {
	head.removeChild(style);
	// NOTE on IE sometimes content stays hidden although 
	// the stylesheet has been removed.
	// The following forces the content to be revealed
	document.body.style.visibility = "hidden";
	document.body.style.visibility = "";
	hidden = false;
}

/* 
NOTE:  for more details on how checkStyleSheets() works cross-browser see 
http://aaronheckmann.blogspot.com/2010/01/writing-jquery-plugin-manager-part-1.html
TODO: does this still work when there are errors loading stylesheets??
*/
var checkStyleSheets = sys.checkStyleSheets = function() {
	// check that every <link rel="stylesheet" type="text/css" /> 
	// has loaded
	return every($$("link"), function(node) {
		if (!node.rel || !/^stylesheet$/i.test(node.rel)) return true;
		if (node.type && !/^text\/css$/i.test(node.type)) return true;
		if (node.disabled) return true;
		
		// handle IE
		if (node.readyState) return readyStateLookup[node.readyState];

		var sheet = node.sheet || node.styleSheet;

		// handle webkit
		if (!sheet) return false;

		try {
			// Firefox should throw if not loaded or cross-domain
			var rules = sheet.rules || sheet.cssRules;
			return true;
		} 
		catch (error) {
			// handle Firefox cross-domain
			return (error.name == "NS_ERROR_DOM_SECURITY_ERR");
		} 
	});
}

function init() {
	head.insertBefore(style, script);
	hidden = true;
	onprogress();
}
function onprogress() {
	_init();
	if (sys.readyState != "complete") timerId = window.setTimeout(onprogress, 25); // FIXME make interval config option
}

var _initializing = false; // guard against re-entrancy
function _init() {
	if (_initializing) {
		logger.warn("Reentrancy in decorSystem initialization.");
		return;
	}
	if (sys.readyState == "complete") {
		logger.warn("decorSystem initialization requested after complete");
		return;
	}
	
	_initializing = true;
	try { __init(); }
	catch (error) {
		logger.error(error.message);
	}
	_initializing = false;	
}

var contentFound = false;
function __init() {
	if (contentFound && hidden && checkStyleSheets()) unhide();
	switch (sys.readyState) { // NOTE all these branches can fall-thru when they result in a state transition
	case "uninitialized":
		findDecorLink();
		if (!decorURL && !document.body) break;
		if (!decorURL || decorURL == document.URL) {
			if (!decorLink) logger.info("No decor URL specified. Processing is complete.");
			else logger.warn("Decor URL is same as current page. Abandoning processing.");
			unhide();
			setReadyState("complete");
			break;
		}
		setReadyState("loadDecor");
		switch (decorLink.type.toLowerCase()) {
		case "text/decor+html":
			loadDocument(function() { setReadyState("fixHead"); });
			break;
		case "text/html": case "":
			importDocument(function() { setReadyState("fixHead"); });
			break;
		default:
			logger.warn("Decor type is not recognized. Abandoning processing.");
			unhide();
			setReadyState("complete");
			break; // FIXME relying on fall-thru behavior to sort this out
		}
	case "loadDecor":
		break;
	case "fixHead":
		body = document.body;
		if (!body) break;
		fixHead();
		if (isIE && IE_VER <= 8) setReadyState("preprocess");
		else setReadyState("insertDecor");
		break;
	case "preprocess":
		preprocess(function(node) { if (node.id) contentFound = true; });
		if (domContentLoaded()) setReadyState("insertDecor");
		if (sys.readyState != "insertDecor")  break;
	case "insertDecor":
		insertDecor();
		setReadyState("process");
	case "process":
		preprocess(function(node) { if (node.id) contentFound = true; });
		process();
		if (domContentLoaded()) setReadyState("loaded");
		else break;
		decorDocument = null;
		head.removeChild(iframe);
	case "loaded":
		if (document.readyState != "complete" || hidden) break;
		setReadyState("complete");
	}

	// NOTE it is an error if we don't get to this point
}

function loadDocument(callback) {
	iframe = document.createElement("iframe");
	iframe.name = "_decor";
	iframe.setAttribute("style", "height: 0; position: absolute; top: -10000px;");
	var onload = function() {
		decorDocument = iframe.contentWindow.document;
		removeExecutedScripts(decorDocument);
		normalizeDocument(decorDocument);
		callback();
	}
	addEvent(iframe, "load", onload);

	iframe.src = decorURL;
	head.insertBefore(iframe, head.firstChild);
}

function normalizeDocument(doc) {
	function normalize(tagName, attrName) { 
		forEach($$(tagName, doc), function(el) { 
			var val = el[attrName];
			if (val) el.setAttribute(attrName, resolveURL(val, doc)); 
		});
	}
	normalize("link", "href");
	normalize("a", "href");
	normalize("script", "src");
	normalize("img", "src");
	normalize("iframe", "src");
	normalize("form", "action");
	// TODO object, embed, etc
}

function importDocument(callback) {
	var xhr = window.XMLHttpRequest ?
		new XMLHttpRequest() :
		new ActiveXObject("Microsoft.XMLHTTP"); 
	xhr.onreadystatechange = function() {
		if (xhr.readyState != 4) return;
		if (xhr.status != 200) { // FIXME
			setReadyState("complete");
			return;
		}
		writeDocument(xhr.responseText, callback);
	}
	xhr.open("GET", decorURL, true); // FIXME sync or async??
	xhr.send("");
}

function writeDocument(html, callback) {
	// insert <base href=decorURL> at top of <head>
	html = html.replace(/(<head>|<head\s+[^>]*>)/i, '$1<base href="' + decorURL + '" /><!--[if lte IE 6]></base><![endif]-->');

	// disable <script async> and <script defer>
	// TODO currently handles script @type=""|"text/javascript"
	// What about "application/javascript", etc??
	html = html.replace(/\<script\b[^>]*\>/ig, function(tag) {
		if (!/\s(async|defer)(=|\s|\>)/i.test(tag)) {
			logger.info("Script will run immediately in decor document: \n\t" + tag);
			return tag;
		}
		if (/\btype=['"]?text\/javascript['"]?(?=\s|\>)/i.test(tag)) {
			return tag.replace(/\btype=['"]?text\/javascript['"]?(?=\s|\>)/i, 'type="text/javascript?async"');
		}
		return tag.replace(/\>$/, ' type="text/javascript?async">');
	});

	iframe = document.createElement("iframe");
	iframe.name = "_decor";
	var onload = function() {
		removeExecutedScripts(decorDocument);
		normalizeDocument(decorDocument);

		forEach($$("base", decorDocument), function(base) { 
			base.parentNode.removeChild(base); 
		});
		return callback();
	}
	iframe.setAttribute("style", "height: 0; position: absolute; top: -10000px;");
	head.insertBefore(iframe, head.firstChild);
	decorDocument = iframe.contentDocument || iframe.contentWindow.document;

	addEvent(iframe, "load", onload); 
	decorDocument.open();
	decorDocument.write(html);
	decorDocument.close();

	// FIXME need warning for doc property mismatches between page and decor
	// eg. charset, doc-mode, content-type, etc
}

var copyAttributes = function(node, srcNode) { // implements srcNode.cloneNode(false)
	var attrs = srcNode.attributes;
	forEach(attrs, function(attr) {
		if (!attr.specified) return;
		node.setAttribute(attr.name, attr.value);
	});
	return node;
}

var importBefore = document.importNode ? 
function(srcNode, marker) { 
	marker.parentNode.insertBefore(document.importNode(srcNode, true), marker); 
} :
function(srcNode, marker) { // document.importNode() NOT available on IE < 9
	var tagName = srcNode.tagName.toLowerCase();
	var node = document.createElement(tagName);
	copyAttributes(node, srcNode);
	switch(tagName) {
	case "title":
		node.innerText = srcNode.innerHTML;
		marker.parentNode.insertBefore(node, marker);
		break;
	case "style":
		marker.parentNode.insertBefore(node, marker);
		node.styleSheet.cssText = srcNode.styleSheet.cssText;
		break;
	case "script":
		node.text = srcNode.text;
		marker.parentNode.insertBefore(node, marker);
		break;
	default: // meta, link have no content
		marker.parentNode.insertBefore(node, marker);
		break;
	}
	return node;
}

var removeExecutedScripts = function(doc) {
	forEach($$("script", doc), function(node) {
		if (node.type && !/^text\/javascript$/i.test(node.type)) return;
		node.parentNode.removeChild(node);
	});
}

var enableScript = function(node) {
	if (!/^text\/javascript\?async$/i.test(node.type)) return;
	var script = document.createElement("script");
	copyAttributes(node, script);
	script.type = "text/javascript";
	
	// FIXME is this comprehensive?
	try { script.innerHTML = node.innerHTML; }
	catch (error) { script.text = node.text; }

	node.parentNode.replaceChild(script, node);
}

function fixHead() {
	var node, next;
	for (node=head.firstChild; next=node && node.nextSibling, node; node=next) {
		if (node.nodeType != 1) continue;
		if (!node.tagName.match(/^(style|link)$/i)) continue;
		if (!node.title.match(/^nodecor$/i)) continue;
		head.removeChild(node);
	}

	var marker = head.firstChild;
	var wHead = decorDocument.head || firstChild(decorDocument.documentElement, "head");
	if (isIE && IE_VER <= 7) {
		var wBody = decorDocument.body;
		forEach($$("style", wBody), function(wNode) {
			wHead.appendChild(wNode);
		});
	}
	for (var wNode=wHead.firstChild; wNode=wNode.nextSibling;) {
		if (wNode.nodeType != 1) continue;
		var tagName = wNode.tagName.toLowerCase();
		switch (tagName) {
		case "title": // NOTE only import title if not already present
			if (firstChild(head, "title")) continue;
			if (!wNode.innerHTML) continue;
			break;
		case "link": // FIXME no duplicates @rel, @href pairs
			break;
		case "meta": // FIXME no duplicates, warn on clash
			if (wNode.httpEquiv) continue;
			break;
		case "style": 
			break;
		case "script":  // FIXME no duplicate @src
			break;
		}
		importBefore(wNode, marker);
	}

	// allow scripts to run
	forEach($$("script", head), enableScript);
}

var cursor;
function preprocess(notify) {
	var node = cursor ? cursor.nextSibling :
		lastDecorNode ? lastDecorNode.nextSibling :
		body.firstChild;
	if (!node) return;
	var next;
	for (next=node.nextSibling; node; (node=next) && (next=next.nextSibling)) {
		if (notify) notify(node);
		if (node.id && $("#"+node.id, decorDocument)) continue;
		body.removeChild(node);
	}
	cursor = body.lastChild;
}

function process(notify) { // NOTE must only be called straight after preprocess()
	var node = lastDecorNode.nextSibling;
	if (!node) return;
	var next;
	for (next=node.nextSibling; node; (node=next) && (next=next.nextSibling)) {
		var target = $("#"+node.id); // NOTE validated in removeContent()
		if (target == node) {
			logger.warn("#" + node.id + " was found in the decor document, but has been replaced by previous page content");
			continue;
		}
		// TODO compat check between node and target
		target.parentNode.replaceChild(node, target);
		// TODO remove @role from node if an ancestor has same role
		if (notify) notify(node);
	}
}


function insertDecor() {
	var wBody = decorDocument.body;
	// NOTE remove non-empty text-nodes - 
	// they can't be hidden if that is appropriate
	for (var node=wBody.firstChild, next=node.nextSibling; next; node=next, next=node.nextSibling) { 
		if (node.nodeType != 3) continue;
		if (/\s*/.test(node.nodeValue)) continue;
		logger.warn("Removing text found as child of decor body.");
		wBody.removeChild(node);
	}
	var div = document.createElement("div");
	div.innerHTML = wBody.innerHTML;
	forEach($$("a", div), function(a) {
		var val = a.href;
		if (val.indexOf(decorURL+"#") != 0) return;
		a.setAttribute("href", val.replace(decorURL, ""));
	});
	content = body.firstChild;
	for (var node; node=div.firstChild; ) {
		body.insertBefore(node, content);
	}
	lastDecorNode = document.createTextNode("");
	body.insertBefore(lastDecorNode, content);
	for (node=body.firstChild; next=node.nextSibling, node!=lastDecorNode; node=next) {
		if (node.nodeType !== 1) continue;
		if ("script" === node.tagName.toLowerCase()) enableScript(node);
		else forEach($$("script", node), enableScript);
	}
	if (!cursor) cursor = lastDecorNode;
}

init();

}); // end decorSystem defn

})();

