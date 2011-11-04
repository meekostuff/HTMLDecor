if (!this.Meeko) this.Meeko = {};
if (!Meeko.stuff) Meeko.stuff = {};

(function() {

var forEach = ([].forEach) ? 
function(a, fn, context) { return [].forEach.call(a, fn, context); } :
function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) fn.call(context, a[i], i, a); }


if (!Meeko.stuff.syslog) Meeko.stuff.syslog = new function() {

var levels = "DEBUG INFO WARN ERROR".split(" ");

forEach(levels, function(name, num) {
	
this["LOG_"+name] = num;	
this[name.toLowerCase()] = function() { this._log({ level: num, message: arguments }); }

}, this);

this.LOG_LEVEL = this.LOG_WARN;

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
/* 
  NOTE the selector matching only supports tagName, class, id, attr
	No combination selectors or selector lists are supported 
*/ 
var selectorLookup = [];
var parseSelector = function(text) {
	var o = selectorLookup[text];
	if (o) return o;
	var m = text.match(/^([a-zA-Z]+)?(#[-_a-zA-Z0-9]+)?(\.[-_a-zA-Z0-9]+)?(\[([-_a-zA-Z]+)(?:=([-_a-zA-Z0-9]+))\])?$/);
	if (!m[0]) throw (text + " is not a recognized selector");
	o = {
		tagName: m[1],
		id: m[2],
		className: m[3]
	}
	if (m[4]) o[m[5]] = m[6];
	selectorLookup[text] = o;
	return o;
}
var _matches = function(node, o) {
	if (node.nodeType != 1) return false;
	for (var name in o) {
		var val = o[name];
		switch (name) {
		case "tagName": 
			if (val && val.toLowerCase() != node.tagName.toLowerCase()) return false;
			break;
		case "className": 
			if (val && node.className.match(val) < 0) return false;
			break;
		case "id": 
			if (val && node.id != val) return false;
			break;
		default:
			var attrVal = node.getAttribute(name);
			if (val && attrVal != val) return false;
			else if (!attrVal) return false;
			break;
		}
	}
	return true;
}
var matches = function(node, selector) { 
	return _matches(node, parseSelector(selector)); 
}
var firstMatch = function(nodeList, selector) {
	var o = parseSelector(selector);
	for (var n=nodeList.length, i=0; i<n; i++) {
		var node = nodeList[i];
		if (_matches(node, o)) return node;
	}
}

var isIE = /*@cc_on!@*/false;
var isIE7 = isIE && window.XMLHttpRequest;
var isIE8 = isIE && document.querySelector;
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
sys.trigger = (!isIE || isIE8) ? "head" : "body";

var readyStateLookup = {
	"uninitialized": false,
	"loading": false,
	"interactive": false,
	"loaded": false,
	"complete": true
}

for (var script=document; script.lastChild; script=script.lastChild);
var head = document.head || firstMatch(document.documentElement.childNodes, "head");

var fragment = document.createDocumentFragment();
var style = document.createElement("style");
fragment.appendChild(style); // NOTE on IE this realizes style.styleSheet !!??

// NOTE hide the page until the decor is ready
// FIXME this should have a configurable timeout so slow loading
// doesn't leave the window blank
if (style.styleSheet) style.styleSheet.cssText = "body { visibility: hidden; }";
else style.textContent = "body { visibility: hidden; }";

function checkTrigger() {
	if (sys.trigger == "head") return !!document.body;
	else return readyStateLookup[document.readyState] || false;
}
function init() {
	head.insertBefore(style, script);
	if (sys.trigger == "head" && checkTrigger()) sys.trigger = "body"; // FIXME
	onprogress();
}
function onprogress() {
	if (sys.readyState == "uninitialized" && checkTrigger() || sys.readyState != "uninitialized") _init();
	if (sys.readyState != "complete") timerId = window.setTimeout(onprogress, 50);
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

var body, main, linkElt;
var httpRequest, iframe, decorURL, decorDocument;

function __init() {
	MAIN: switch (sys.readyState) { // NOTE all these branches can fall-thru when they result in a state transition
	case "uninitialized":
		body = document.body;
		linkElt = firstMatch(head.childNodes, "link[rel=decor]");
		if (!linkElt) {
			sys.readyState = "complete";
			break MAIN;
		}
		sys.readyState = "loading";
		decorURL = resolveURL(linkElt.getAttribute("href"));
		httpRequest = window.XMLHttpRequest ?
			new XMLHttpRequest() :
			new ActiveXObject("Microsoft.XMLHTTP"); 
		httpRequest.open("GET", decorURL, true); // FIXME sync or async??
		httpRequest.send("");
	case "loading":
		;;;logger.debug("loading");
		if (httpRequest.readyState != 4) break MAIN;
		if (httpRequest.status != 200) {
			sys.readyState = "complete";
			break MAIN;
		}
		sys.readyState = "parsing";
		createDocument();
	case "parsing":
		;;;logger.debug("parsing");
		if (decorDocument.readyState && !readyStateLookup[decorDocument.readyState]) break MAIN;
		sys.readyState = "pending";
		fixHead();
	case "pending":
		;;;logger.debug("pending");
		if (fixBody()) sys.readyState = "pending2";
		break MAIN;
	case "pending2":
		;;;logger.debug("pending2");
		sys.readyState = "interactive";
		head.removeChild(style);
		// NOTE on IE sometimes content stays hidden although 
		// the stylesheet has been removed.
		// The following forces the content to be revealed
		body.style.visibility = "hidden";
		body.style.visibility = "";
	case "interactive":
		;;;logger.debug("interactive");
		if (!readyStateLookup[document.readyState]) break MAIN;
		sys.readyState = "loaded";
		finalizeBody();
		decorDocument = null;
		head.removeChild(iframe);
	case "loaded":
		;;;logger.debug("loaded");
		if (document.readyState != "complete") break MAIN;
		sys.readyState = "complete";
	}

	// NOTE it is an error if we don't get to this point
}

function createDocument() {
	var html = httpRequest.responseText;
	var baseURL = decorURL.replace(/\/[^\/]*$/, "/");
	html = html.replace(/(<head>|<head\s+[^>]*>)/i, '$1<base href="' + decorURL + '"><!--[if lte IE 6]></base><![endif]-->');

	iframe = document.createElement("iframe");
	iframe.setAttribute("style", "height: 0; position: absolute; top: -10000px;");
	head.insertBefore(iframe, script);
	decorDocument = iframe.contentDocument || iframe.contentWindow.document;
	decorDocument.open();
	decorDocument.write(html);

	function normalize(tagName, attrName) { 
		forEach($$(tagName, decorDocument), function(el) { 
			var val = el[attrName];
			if (val) el.setAttribute(attrName, resolveURL(val, decorDocument)); 
		});
	}
	normalize("link", "href");
	normalize("a", "href");
	normalize("script", "src");
	normalize("img", "src");
	normalize("form", "action");

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
	var wHead = decorDocument.head || firstMatch(decorDocument.documentElement.childNodes, "head");
	var node;
	for (var wNode; wNode=wHead.firstChild;) {
		wHead.removeChild(wNode);
		if (wNode.nodeType != 1) continue;
		if (document.importNode) node = document.importNode(wNode, true);
		else node = document.createElement(wNode.outerHTML);
		switch (wNode.tagName.toLowerCase()) {
		case "title": // NOTE only import title if not already present
			if (firstMatch(head.childNodes, "title")) continue;
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
		head.insertBefore(node, linkElt);
	}
}

function fixBody() {
	// FIXME the [role=main] container should be configurable, 
	// probably using an element ID.

	if (main) return true;
	main = firstMatch(body.childNodes, "[role=main]");
	if (!main) return false;
	for (var cursor; cursor=body.firstChild;) {
		if (cursor == main) break;
		body.removeChild(cursor);
	}
	var wBody = decorDocument.body;
	for (var wNode; wNode=wBody.firstChild; ) {
		var node = wNode.cloneNode(true);
		wBody.removeChild(wNode);
		if (matches(node, "[role=main]")) break;
		try { if (!body.insertBefore(node, main)) throw ""; } // NOTE IE6 occasionally silently fails on insertBefore()
		catch (error) { main.insertAdjacentHTML("beforeBegin", node.outerHTML); }
	}
	return true;
}

function finalizeBody() {
	var cursor;
	while (cursor = main.nextSibling) {
		body.removeChild(cursor);
	}

	var wBody = decorDocument.body;
	forEach(wBody.childNodes, function(wNode) {
		var node = wNode.cloneNode(true);
		wBody.removeChild(wNode);
		try { body.appendChild(node); }
		catch (error) { body.insertAdjacentHTML("beforeEnd", node.outerHTML); }
	});
	
}

init();

sys.initialize = manualInit;

} // end decorSystem defn

})();
