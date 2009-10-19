var log = (window.console) ? function(data) { console.log(data); } : function(data) {};

var logger = {
	log: log,
	debug: log,
	info: log,
	warn: log,
	error: log
};

if (!Meeko) this.Meeko = {};
if (!Meeko.stuff) Meeko.stuff = {};
if (!Meeko.stuff.decorSystem) Meeko.stuff.decorSystem = (function() {

var readyState = "uninitialized",
	trigger = "head";

var readyStateLookup = {
	"uninitialized": false,
	"loading": false,
	"interactive": false,
	"loaded": false,
	"complete": true
}
function checkTrigger() {
	if (trigger == "head") return (document.body) ? true : false;
	else return readyStateLookup[document.readyState] || false;
}
function init() {
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

var head, body, main;
var httpRequest, iframe, contentDocument;

function __init() {
	MAIN: switch (readyState) { // NOTE all these branches can fall-thru when they result in a state transition
		case "uninitialized":
			head = document.querySelector("head");
			body = document.body;
			var linkElt = document.querySelector("link[rel=decor]");
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
			if (contentDocument.readyState && !readyStateLookup[contentDocument.readyState]) break MAIN;
			readyState = "interactive";
			fixHead();
		case "interactive":
			;;;logger.debug("interactive");
			fixBody();
			if (!readyStateLookup[document.readyState]) break MAIN;
			readyState = "loaded";
			finalizeBody();
		case "loaded":
			;;;logger.debug("loaded");
			if (document.readyState != "complete") break MAIN;
			readyState = "complete";
			contentDocument = null;
			head.removeChild(iframe);
	}

	// NOTE it is an error if we don't get to this point
}

function createDocument() {
	iframe = document.createElement("iframe");
	iframe.setAttribute("style", "height: 0; position: absolute; top: -10000px;");
	head.appendChild(iframe);
	contentDocument = iframe.contentDocument || iframe.contentWindow.document;
	contentDocument.open();
	contentDocument.write(httpRequest.responseText);
	contentDocument.close();
}

function fixHead() {
	var cursor = head.firstChild;
	var wHead = contentDocument.getElementsByTagName("head")[0];
	for (var wNode; wNode=wHead.firstChild; ) {
		var node; // FIXME SLAB should get document.importNode right
		try { node = document.importNode(wNode, true); }
		catch (error) { node = wNode.cloneNode(true); }
		wHead.removeChild(wNode);
		if (node.nodeType == 1) switch (node.tagName.toLowerCase()) {
			case "title":
				if (head.querySelector("title")) node = null;
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
		if (node && node.nodeType == 1) {
			head.appendChild(node);
		}
	}
}

function fixBody() {
	if (main) return;
	var cursor;
	for (cursor=body.firstChild; cursor; cursor=cursor.nextSibling) {
		if (cursor.nodeType == 1 && cursor.getAttribute("role") == "main") {
			main = cursor;
			break;
		}
	}
	if (!main) return;
	while (cursor = body.firstChild) {
		if (cursor == main) break;
		body.removeChild(cursor);
	}

	var wBody = contentDocument.getElementsByTagName("body")[0];			
	for (var wNode; wNode=wBody.firstChild; ) {
		var node = wNode.cloneNode(true);
		wBody.removeChild(wNode);
		if (wNode.nodeType == 1 && wNode.getAttribute("role") == "main") break;
		try { if (!body.insertBefore(node, main)) throw ""; } // NOTE IE6 occasionally silently fails on insertBefore()
		catch (error) { main.insertAdjacentHTML("beforeBegin", node.outerHTML); }
	}	
}

function finalizeBody() {
	var cursor;
	while (cursor = main.nextSibling) {
		body.removeChild(cursor);
	}

	var wBody = contentDocument.getElementsByTagName("body")[0];			
	for (var wNode; wNode=wBody.firstChild; ) {
		var node = wNode.cloneNode(true);
		wBody.removeChild(wNode);
		try { body.appendChild(node); }
		catch (error) { body.insertAdjacentHTML("beforeEnd", node.outerHTML); }
	}
	
}

init();

return {
	initialize: manualInit
}

})();
