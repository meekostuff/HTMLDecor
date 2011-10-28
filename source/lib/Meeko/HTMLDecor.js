if (!this.Meeko) this.Meeko = {};
if (!Meeko.stuff) Meeko.stuff = {};
if (!Meeko.stuff.decorSystem) Meeko.stuff.decorSystem = (function() {

var log = (window.console) ? function(data) { console.log(data); } : function(data) {};

var logger = {
	log: log,
	debug: log,
	info: log,
	warn: log,
	error: log
};

var forEach = ([].forEach) ? 
function(a, fn) { return [].forEach.call(a, fn); } :
function(a, fn) { for (var n=a.length, i=0; i<n; i++) fn(a[i], i, a); }

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
var isIE8 = isIE && document.querySelector;
var readyState = "uninitialized",
	trigger = (!isIE || isIE8) ? "head" : "body";

var readyStateLookup = {
	"uninitialized": false,
	"loading": false,
	"interactive": false,
	"loaded": false,
	"complete": true
}

for (var script=document; script.lastChild; script=script.lastChild);
var head = document.head || firstMatch(document.documentElement.childNodes, "head");

var style = document.createElement("style");

function checkTrigger() {
	if (trigger == "head") return !!document.body;
	else return readyStateLookup[document.readyState] || false;
}
function init() {
	head.insertBefore(style, script);
	if (style.styleSheet) style.styleSheet.addRule("body", "display: none; ");
	else style.textContent = "body { display: none; }";
	if (trigger == "head" && checkTrigger()) trigger = "body"; // FIXME
	onprogress();
}
function onprogress() {
	if (readyState == "uninitialized" && checkTrigger() || readyState != "uninitialized") _init();
	if (readyState != "complete") timerId = window.setTimeout(onprogress, 50);
}

var _initializing = false; // guard against re-entrancy
function _init() {
	if (_initializing) {
		logger.warn("Reentrancy in decorSystem initialization.");
		return;
	}
	if (readyState == "complete") {
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
	if (readyState != "uninitialized") {
		logger.warn("Manual decorSystem initialization requested after automatic start");
		return;		
	}
	__init();
	onprogress();
}

var body, main, linkElt;
var httpRequest, iframe, decorDocument;

function __init() {
	MAIN: switch (readyState) { // NOTE all these branches can fall-thru when they result in a state transition
	case "uninitialized":
		body = document.body;
		linkElt = firstMatch(head.childNodes, "link[rel=decor]");
		if (!linkElt) {
			readyState = "complete";
			break MAIN;
		}
		readyState = "loading";
		var href = linkElt.href;
		httpRequest = new XMLHttpRequest();
		httpRequest.open("GET", href, true); // FIXME sync or async??
		httpRequest.send("");
	case "loading":
		;;;logger.debug("loading");
		if (httpRequest.readyState != 4) break MAIN;
		if (httpRequest.status != 200) {
			readyState = "complete";
			break MAIN;
		}
		readyState = "parsing";
		createDocument();
	case "parsing":
		;;;logger.debug("parsing");
		if (decorDocument.readyState && !readyStateLookup[decorDocument.readyState]) break MAIN;
		readyState = "interactive";
		fixHead();
	case "interactive":
		;;;logger.debug("interactive");
		fixBody();
		head.removeChild(style);
		if (!readyStateLookup[document.readyState]) break MAIN;
		readyState = "loaded";
		finalizeBody();
		decorDocument = null;
		head.removeChild(iframe);
	case "loaded":
		;;;logger.debug("loaded");
		if (document.readyState != "complete") break MAIN;
		readyState = "complete";
	}

	// NOTE it is an error if we don't get to this point
}

function createDocument() {
	iframe = document.createElement("iframe");
	iframe.setAttribute("style", "height: 0; position: absolute; top: -10000px;");
	head.insertBefore(iframe, script);
	decorDocument = iframe.contentDocument || iframe.contentWindow.document;
	decorDocument.open();
	decorDocument.write(httpRequest.responseText);
	decorDocument.close();
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
		switch (node.tagName.toLowerCase()) {
		case "title":
			if (firstMatch(head.childNodes, "title")) continue;
			break;
		case "link": // TODO
			break;
		case "meta": // TODO
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
	if (main) return;
	main = firstMatch(body.childNodes, "[role=main]");
	if (!main) return;
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

return {
	initialize: manualInit
}

})();
