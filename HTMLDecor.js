// TODO Move script and options detection outside of the decorSystem module
// Eventually logger and decorSystem could be in separate modules
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
var stuff = Meeko.stuff || (Meeko.stuff = {});

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
	var m = selector.match(/^([a-zA-Z]+)$/);
	if (!m[0]) throw (selector + " can only be a tagName selector in $$()");
	return context.getElementsByTagName(m[1]);
}

var matchesElement = function(selector, node) {
	var tagName = selector.toLowerCase();
	var matcher = function(el) {
		return (el.nodeType == 1 && el.tagName.toLowerCase() == tagName);
	}
	return (node) ? matchel(node) : matcher;
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
	IE_VER = 1 * div.innerHTML;
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

var head, style, body, lastDecorNode, fragment, iframe, decorLink, decorHREF, decorURL, decorDocument;

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
function unhide() {
	if (style.parentNode != head) return;
	head.removeChild(style);
	// NOTE on IE sometimes content stays hidden although 
	// the stylesheet has been removed.
	// The following forces the content to be revealed
	document.body.style.visibility = "hidden";
	document.body.style.visibility = "";
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

var unhiding = false;
function __init() {
	if (unhiding) {
		unhide();
		unhiding = false;
	}
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
		//importDocument(function() { setReadyState("fixHead"); });
		loadDocument(function() { setReadyState("fixHead"); });
	case "loadDecor":
		break;
	case "fixHead":
		body = document.body;
		if (!body) break;
		fixHead();
		setReadyState("preprocess");
	case "preprocess":
		preprocess(function(node) {
			if (node.nodeType != 1) return;
			if (node.id) {
				if (isIE && IE_VER <= 8) unhiding = true;
				else setReadyState("insertDecor");
			}
		});
		if (unhiding) break;
		if (isIE && IE_VER <= 8 && readyStateLookup[document.readyState]) {
				setReadyState("insertDecor");
		}
		if (sys.readyState != "insertDecor") break;
	case "insertDecor":
		insertDecor();
		setReadyState("process");
		if (!isIE || IE_VER > 8) {
			unhiding = true;
			break; // NOTE allow page reflow before un-hiding
		}
	case "process":
		preprocess();
		process();
		setReadyState("loaded");
		decorDocument = null;
		head.removeChild(iframe);
	case "loaded":
		if (document.readyState != "complete") break;
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
			setReadyState("complete");
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
	for (var node=head.firstChild, next; next=node && node.nextSibling, node; node=next) {
		if (node.nodeType != 1) continue;
		if (!node.tagName.match(/^(style|link)$/i)) continue;
		if (!node.title.match(/^nodecor$/i)) continue;
		head.removeChild(node);
	}

	var firstChild = head.firstChild;
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
		head.insertBefore(node, firstChild);
	}
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

function process() { // NOTE must only be called straight after preprocess()
	var node = lastDecorNode.nextSibling;
	if (!node) return;
	var next;
	for (next=node.nextSibling; node; (node=next) && (next=next.nextSibling)) {
		var target = $("#"+node.id); // NOTE validated in removeContent()
		// TODO compat check between node and target
		target.parentNode.replaceChild(node, target);
		// TODO remove @role from node if an ancestor has same role
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
	lastDecorNode = div.lastChild;
	content = body.firstChild;
	for (var node; node=div.firstChild; ) {
		body.insertBefore(node, content);
	}
	if (!cursor) cursor = lastDecorNode;
}

init();

}); // end decorSystem defn

})();

