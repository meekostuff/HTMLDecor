// TODO Move script and options detection outside of the decorSystem module
// Eventually syslog and decorSystem could be in separate modules
// and built into this script.

(function() {

var script;
for (script=document; script.lastChild; script=script.lastChild);

if (window.name == "_decor") { 
	// NOTE if HTMLDecor is included in a decor document then abort and 
	// remove script so it doesn't get copied into the page
	script.parentNode.removeChild(script);
	return; 
}

var Meeko = window.Meeko || (window.Meeko = {});
if (!Meeko.stuff) Meeko.stuff = {};

var forEach = ([].forEach) ? 
function(a, fn, context) { return [].forEach.call(a, fn, context); } :
function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) fn.call(context, a[i], i, a); }

var addEvent = 
	document.addEventListener && function(node, event, fn) { return node.addEventListener(event, fn, false); } ||
	document.attachEvent && function(node, event, fn) { return node.attachEvent("on" + event, fn); } ||
	function(node, event, fn) { node["on" + event] = fn; }

var $ = function(selector, context) {
	if (!context) context = document;
	else if (context.nodeType != 9) context = context.ownerDocument;
	var m = selector.match(/^#([-_a-zA-Z0-9]+)$/);
	if (!m[0]) throw (selector + " can only be an ID selector in $()");
	return context.getElementById(m[1]);
}
var $$ = function(selector, context) {
	var context = context || document;
	var m = selector.match(/^([a-zA-Z]+)$/);
	if (!m[0]) throw (selector + " can only be a tagName selector in $$()");
	return context.getElementsByTagName(m[1]);
}

var firstChild = function(parent, selector) {
	selector = selector.toLowerCase();
	var nodeList = parent.childNodes;
	for (var n=nodeList.length, i=0; i<n; i++) {
		var node = nodeList[i], tagName = node.tagName;
		if (tagName && tagName.toLowerCase() == selector) return node;
	}
}

// TODO the best way to do IE detection is to insert conditional comments
var isIE = /*@cc_on!@*/false;
var isIE7 = isIE && window.XMLHttpRequest;
var isIE8 = isIE && document.querySelector;

if (!Meeko.stuff.syslog) Meeko.stuff.syslog = new function() {

var levels = "DEBUG INFO WARN ERROR".split(" ");

forEach(levels, function(name, num) {
	
this["LOG_"+name] = num;	
this[name.toLowerCase()] = function() { this._log({ level: num, message: arguments }); }

}, this);

this.LOG_LEVEL = this.LOG_DEBUG;

this._log = function(data) { 
	if (data.level < this.LOG_LEVEL) return;
	data.timeStamp = +(new Date);
        data.message = [].join.call(data.message, " ");
        if (this.write) this.write(data);
}

this.write = (window.console) &&
function(data) { console.log(levels[data.level], ": ", data.message); };

} // end syslog defn


if (!Meeko.stuff.decorSystem) Meeko.stuff.decorSystem = new function() {

var sys = this;
var logger = Meeko.stuff.syslog;

// NOTE resolveURL shouldn't be needed, or at least
// el.setAttribute(attr, el[attr]) should suffice.
// But IE doesn't return relative URLs for <link>, and
// does funny things on anchors
// FIXME might be able to refactor to only resolve for <link>
var resolveURL = (!isIE || isIE8) ? 
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

sys.readyState = "uninitialized";

var readyStateLookup = {
	"uninitialized": false,
	"loading": false,
	"interactive": false,
	"loaded": false,
	"complete": true
}

var head, style, body, main, mainID, mainContainer, fragment, iframe, decorURL, decorDocument;

head = document.head || firstChild(document.documentElement, "head");

fragment = document.createDocumentFragment();
style = document.createElement("style");
fragment.appendChild(style); // NOTE on IE this realizes style.styleSheet !!??

// NOTE hide the page until the decor is ready
// FIXME this should have a configurable timeout so slow loading
// doesn't leave the window blank
if (style.styleSheet) style.styleSheet.cssText = "body { visibility: hidden; }";
else style.textContent = "body { visibility: hidden; }";
function unhide() {
	head.removeChild(style);
	// NOTE on IE sometimes content stays hidden although 
	// the stylesheet has been removed.
	// The following forces the content to be revealed
	body.style.visibility = "hidden";
	body.style.visibility = "";
}

function init() {
	head.insertBefore(style, script);
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

function manualInit() {
	if (sys.readyState != "uninitialized") {
		logger.warn("Manual decorSystem initialization requested after automatic start");
		return;		
	}
	__init();
	onprogress();
}

function __init() {
	switch (sys.readyState) { // NOTE all these branches can fall-thru when they result in a state transition
	case "uninitialized":
		body = document.body;
		var href = script.getAttribute("data-href");
		decorURL = resolveURL(href);
		if (decorURL == document.URL) {
			if (!href) logger.info("No decor URL specified. Processing is complete.");
			else logger.warn("Decor URL is same as current page. Abandoning processing.");
			unhide();
			sys.readyState = "complete";
			break;
		}
		mainID = script.getAttribute("data-main");
		if (!mainID) {
			logger.warn("No main content identifier specified. Abandoning processing.");
			unhide();
			sys.readyState = "complete";
			break;
		}
		sys.readyState = "loading";
		//importDocument(function() { sys.readyState = "parsing"; });
		loadDocument(function() { sys.readyState = "parsing"; });
	case "loading":
		;;;logger.debug("loading");
		break;
	case "parsing":
		;;;logger.debug("parsing");
		body = document.body;
		if (!body) break;
		fixHead();
		sys.readyState = "pending";
	case "pending":
		;;;logger.debug("pending");
		main = $("#"+mainID);
		if (!main) break;
		if (main.parentNode != body) {
			logger.error("#" + mainID + " is not an immediate child of document.body. Abandoning processing. ");
			sys.readyState = "complete";
		}
		sys.readyState = "pending2";
		fixBody();
		break; // NOTE allow page reflow before un-hiding
	case "pending2":
		;;;logger.debug("pending2");
		sys.readyState = "interactive";
		unhide();
	case "interactive":
		;;;logger.debug("interactive");
		if (!readyStateLookup[document.readyState]) break;
		sys.readyState = "loaded";
		finalizeBody();
		decorDocument = null;
		head.removeChild(iframe);
	case "loaded":
		;;;logger.debug("loaded");
		if (document.readyState != "complete") break;
		sys.readyState = "complete";
	}

	// NOTE it is an error if we don't get to this point
}

function loadDocument(callback) {
	iframe = document.createElement("iframe");
	iframe.name = "_decor";
	iframe.setAttribute("style", "height: 0; position: absolute; top: -10000px;");
	var onload = function() {
		decorDocument = iframe.contentWindow.document;
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
	normalize("form", "action");
}

function importDocument(callback) {
	var xhr = window.XMLHttpRequest ?
		new XMLHttpRequest() :
		new ActiveXObject("Microsoft.XMLHTTP"); 
	xhr.onreadystatechange = function() {
		if (xhr.readyState != 4) return;
		if (xhr.status != 200) { // FIXME
			sys.readyState = "complete";
			return;
		}
		writeDocument(xhr.responseText, callback);
	}
	xhr.open("GET", decorURL, true); // FIXME sync or async??
	xhr.send("");
}

function writeDocument(html, callback) {
	html = html.replace(/(<head>|<head\s+[^>]*>)/i, '$1<base href="' + decorURL + '" /><!--[if lte IE 6]></base><![endif]-->');

	iframe = document.createElement("iframe");
	iframe.name = "_decor";
	addEvent(iframe, "load", callback);
	iframe.setAttribute("style", "height: 0; position: absolute; top: -10000px;");
	head.insertBefore(iframe, head.firstChild);
	decorDocument = iframe.contentDocument || iframe.contentWindow.document;
	decorDocument.open();
	decorDocument.write(html);

	normalizeDocument(decorDocument);

	forEach($$("base", decorDocument), function(base) { 
		base.parentNode.removeChild(base); 
	});

	// NOTE IE doesn't always get to document.readyState == "complete
	// if document.close() is called BEFORE normalizing URLs.
	decorDocument.close();

	// FIXME need warning for doc property mismatches between page and decor
	// eg. charset, doc-mode, content-type, etc
}

function fixHead() {
	var cursor = head.firstChild;
	var wHead = decorDocument.head || firstChild(decorDocument.documentElement, "head");
	var node;
	for (var wNode; wNode=wHead.firstChild;) {
		wHead.removeChild(wNode);
		if (wNode.nodeType != 1) continue;
		if (document.importNode) node = document.importNode(wNode, true);
		else node = document.createElement(wNode.outerHTML);
		switch (wNode.tagName.toLowerCase()) {
		case "title": // NOTE only import title if not already present
			if (firstChild(head, "title")) continue;
			break;
		case "link": // TODO
			break;
		case "meta": // TODO
			// FIXME importing meta's in IE < 8 cause grief
			if (wNode.httpEquiv) continue;
			break;
		case "style": // TODO
			break;
		case "script": // TODO
			break;
		}
		head.insertBefore(node, cursor);
	}
}

function fixBody() {
	for (var cursor; cursor=body.firstChild;) {
		if (cursor == main) break;
		body.removeChild(cursor);
	}
	var wBody = decorDocument.body;
	var decorMain = $("#"+mainID, decorDocument);
	var decorID = "_decor_" + mainID;
	decorMain.id = decorID;
	var div = document.createElement("div");
	div.innerHTML = wBody.innerHTML;
	for (var node; node=div.firstChild; ) {
		body.insertBefore(node, main);
	}
	var _main = $("#"+decorID);
	// TODO compat check between main and _main
	_main.parentNode.replaceChild(main, _main);
	for (var node=main; node.parentNode!==body; node=node.parentNode);
	mainContainer = node;
}

function finalizeBody() {
	var cursor;
	while (cursor = mainContainer.nextSibling) {
		body.removeChild(cursor);
	}
}

init();

sys.initialize = manualInit;

} // end decorSystem defn

})();

