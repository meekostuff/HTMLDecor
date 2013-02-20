/*!
 * Copyright 2009-2012 Sean Hogan (http://meekostuff.net/)
 * Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
 */

// TODO Move script and options detection outside of the decorSystem module
// Eventually logger and decorSystem could be in separate modules
// and built into this script.

(function() {

// NOTE if HTMLDecor is included in a decor document then abort 
if (window.name == "_decor") return; 

// or if "nodecor" is one of the search options
if (/(^\?|&)nodecor($|&)/.test(location.search)) return; // WARN deprecated

var defaults = { // NOTE defaults also define the type of the associated config option
	"log-level": "warn",
	"decor-autostart": true,
	"decor-hidden-timeout": 3000,
	"decor-polling-interval": 50
}
var vendorPrefix = "meeko"; // NOTE added as prefix for url-options, and *Storage
var modulePrefix = "decor"; // NOTE removed as prefix for data-* attributes

/*
 ### Utility functions
 */

var last = function(a) { return a[a.length - 1]; }

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

var extend = function(dest, src) {
	for (slot in src) {
		if (src.hasOwnProperty && src.hasOwnProperty(slot)) dest[slot] = src[slot];
	}
}

var addEvent = 
	document.addEventListener && function(node, event, fn) { return node.addEventListener(event, fn, false); } ||
	document.attachEvent && function(node, event, fn) { return node.attachEvent("on" + event, fn); } ||
	function(node, event, fn) { node["on" + event] = fn; }

var $ = function(selector, context) { // WARN only selects by #id
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
var $$ = function(selector, context) { // WARN only selects by tagName
	var context = context || document;
	try { return context.getElementsByTagName(selector); }
	catch (error) {
		throw (selector + " can only be a tagName selector in $$()");
	}
}

var matchesElement = function(selector, node) { // WARN only matches by tagName
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

// FIXME this IE_VER detection fails when using compatibility modes.
// i.e. IE9 in IE7 compat mode is still detected as IE9
var IE_VER, isIE = /*@cc_on!@*/false; // NOTE IE10 won't be classified as IE
if (isIE) {
	var div = document.createElement("div");
	div.innerHTML = 
		"<!--[if lte IE 6]>6<![endif]-->" + 
		"<!--[if IE 7]>7<![endif]-->" + 
		"<!--[if IE 8]>8<![endif]-->" +
		"<!--[if IE 9]>9<![endif]-->";
	IE_VER = (div.innerHTML) ? 1 * div.innerHTML : 5;
}

/*
 ### Get config options
*/

var script = last(document.getElementsByTagName("script")); // WARN this wouldn't be valid if script is dynamically inserted

var dataSources = [];
if (window.sessionStorage) dataSources.push( function(name) { return sessionStorage.getItem(vendorPrefix+"-"+name); });
if (window.localStorage) dataSources.push( function(name) { return localStorage.getItem(vendorPrefix+"-"+name); });
dataSources.push(function(name) { return script.getAttribute("data-" + name.replace(modulePrefix+"-", "")); });

var getData = function(name, type) {
	var data = null;
	every(dataSources, function(fn) {
		var val = fn(name);
		if (val == null) return true;
		if (val == "") return true; // TODO log warning "Empty config option"
		switch (type) {
		case "string": data = val; break;
		case "number":
			if (!isNaN(val)) data = 1 * val;
			// TODO else logger.warn("incorrect config option " + val + " for " + name); 
			break;
		case "boolean":
			if (/^(yes|on|true|1)$/i.test(val)) data = true;
			else if (/^(no|off|false|0)$/i.test(val)) data = false;
			// TODO else logger.warn("incorrect config option " + val + " for " + name); 
			break;
		}
		return (data == null); 
	});
	return data;
}

var getConfig = function() {
	var config = {};
	for (var name in defaults) {
		var def = config[name] = defaults[name];
		var val = getData(name, typeof def);
		if (val != null) config[name] = val;
	}
	return config;
}

var config = getConfig();

var Meeko = window.Meeko || (window.Meeko = {});
var stuff = Meeko.stuff || (Meeko.stuff = {});

var logger = Meeko.stuff.logger || (Meeko.stuff.logger = new function() {

var levels = "NONE ERROR WARN INFO DEBUG".split(" ");

forEach(levels, function(name, num) {
	
this["LOG_"+name] = num;
this[name.toLowerCase()] = function() { this._log({ level: num, message: arguments }); }

}, this);

this._log = function(data) { 
	if (data.level > this.LOG_LEVEL) return;
	data.timeStamp = +(new Date);
        data.message = [].join.call(data.message, " ");
        if (this.write) this.write(data);
}

this.startTime = +(new Date), padding = "      ";

this.write = (window.console) && function(data) { 
	var offset = padding + (data.timeStamp - this.startTime), 
		first = offset.length-padding.length-1,
		offset = offset.substring(first);
	console.log(offset+"ms " + levels[data.level]+": " + data.message); 
}

this.LOG_LEVEL = this.LOG_WARN; // DEFAULT

}); // end logger defn

var log_index = logger["LOG_" + config["log-level"].toUpperCase()];
if (log_index != null) logger.LOG_LEVEL = log_index;

var decorSystem = Meeko.stuff.decorSystem || (Meeko.stuff.decorSystem = new function() {

var sys = this;
sys["hidden-timeout"] = 0;
sys["polling-interval"] = 50;

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

sys.complete = false;
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

var head, body, style, lastDecorNode, fragment, iframe, decorLink, decorHREF, decorURL, decorLoader;

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
function hide() {
	head.insertBefore(style, script);
	hidden = true;	
}
function unhide() {
	head.removeChild(style);
	// NOTE on IE sometimes content stays hidden although 
	// the stylesheet has been removed.
	// The following forces the content to be revealed
	if (document.body) {
		document.body.style.visibility = "hidden";
		document.body.style.visibility = "";
	}
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

sys.start = function start() {
	hide();
	onprogress();
}
function onprogress() {
	_init();
	if (!sys.complete) timerId = window.setTimeout(onprogress, sys["polling-interval"]); // FIXME make interval config option
}

var _initializing = false; // guard against re-entrancy
function _init() {
	if (_initializing) {
		logger.warn("Reentrancy in decorSystem initialization.");
		return;
	}
	if (sys.complete) {
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
	var now = +(new Date);
	// NOTE if this test is done after the for_loop it results in a FOUC on Firefox
	if (hidden && (now - logger.startTime > sys["hidden-timeout"] || contentFound && checkStyleSheets())) unhide();
	for (;;) {
		if (sys.readyState == "complete") break;
		var next = handlers[sys.readyState]();
		if (!next || next == sys.readyState) break;
		setReadyState(next);
	}
	if (sys.readyState == "complete" && !hidden) sys.complete = true;
}

var handlers = {
	"uninitialized": function() {
		findDecorLink();
		if (!decorURL && !document.body) return;
		if (!decorURL || decorURL == document.URL) {
			if (!decorLink) logger.info("No decor URL specified. Processing is complete.");
			else logger.warn("Decor URL is same as current page. Abandoning processing.");
			return "complete";
		}
		return "loadDecor";
	},
	"loadDecor": function() {
		if (!decorLoader) decorLoader = new Decor(decorURL, decorLink.type); // FIXME handle unknown decor type
		if (!decorLoader.complete) return; // FIXME handle decor load failure
		return "fixHead";
	},
	"fixHead": function() {
		body = document.body;
		if (!body) return;
		fixHead();
		return (isIE && IE_VER <= 8) ? "preprocess" : "insertDecor";
	},
	"preprocess": function() {
		preprocess(function(node) { if (node.id) contentFound = true; });
		if (domContentLoaded()) return "insertDecor";
		return;
	},
	"insertDecor": function() {
		insertDecor();
		return "process";
	},
	"process": function() {
		preprocess(function(node) { if (node.id) contentFound = true; });
		process();
		if (domContentLoaded()) return "loaded";
		return;
	},
	"loaded": function() {
		if (decorLoader) decorLoader = decorLoader.DESTROY();
		if (document.readyState == "complete") return "complete";
		return;
	}
}

function Decor(url, type) {
	this.complete = false;
	this.url = url;
	this.type = type;
	switch (type.toLowerCase()) {
	case "text/decor+html":
		this.loadDecor(url);
		break;
	case "text/html": case "":
		this.loadHTML(url);
		break;
	default:
		logger.error("Invalid decor document type: " + type);
		break;
	}
	return this;
}

extend(Decor.prototype, {
	
DESTROY: function() {
	delete this.document;
	delete this.complete;
	var iframe = this.iframe;
	iframe.parentNode.removeChild(iframe);	
	delete this.iframe;
	return null;
},

loadDecor: function(url, callback) {
	var decor = this;
	var iframe = decor.iframe = document.createElement("iframe");
	iframe.name = "_decor";
	iframe.setAttribute("style", "height: 0; position: absolute; top: -10000px;");
	var onload = function() {
		var decorDocument = decor.document = iframe.contentWindow.document;
		removeExecutedScripts(decorDocument);
		normalizeDocument(decorDocument);
		decor.complete = true;
		callback && callback(decorDocument);
	}
	addEvent(iframe, "load", onload);

	iframe.src = url;
	head.insertBefore(iframe, head.firstChild);
},

loadHTML: function(url, callback) {
	var decor = this;
	var xhr = window.XMLHttpRequest ?
		new XMLHttpRequest() :
		new ActiveXObject("Microsoft.XMLHTTP"); 
	xhr.onreadystatechange = function() {
		if (xhr.readyState != 4) return;
		if (xhr.status != 200) { // FIXME
			setReadyState("complete");
			return;
		}
		decor.write(xhr.responseText, callback);
	}
	xhr.open("GET", url, true);
	xhr.send("");
},

write: function(html, callback) {
	var decor = this;
	
	// insert <base href=decorURL> at top of <head>
	var html = html.replace(/(<head>|<head\s+[^>]*>)/i, '$1<base href="' + decor.url + '" /><!--[if lte IE 6]></base><![endif]-->');

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

	var iframe = decor.iframe = document.createElement("iframe");
	iframe.name = "_decor";
	var onload = function() {
		var decorDocument = decor.document;
		removeExecutedScripts(decorDocument);
		normalizeDocument(decorDocument);

		forEach($$("base", decorDocument), function(base) { 
			base.parentNode.removeChild(base); 
		});
		decor.complete = true;
		callback && callback(decorDocument);
	}
	iframe.setAttribute("style", "height: 0; position: absolute; top: -10000px;");
	head.insertBefore(iframe, head.firstChild);
	var decorDocument = decor.document = iframe.contentDocument || iframe.contentWindow.document;

	addEvent(iframe, "load", onload); 
	decorDocument.open();
	decorDocument.write(html);
	decorDocument.close();

	// FIXME need warning for doc property mismatches between page and decor
	// eg. charset, doc-mode, content-type, etc
}

});

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
	var decorDocument = decorLoader.document;
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
	var decorDocument = decorLoader.document;
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
	var decorDocument = decorLoader.document;
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

}); // end decorSystem defn

decorSystem["polling-interval"] = config["decor-polling-interval"];
decorSystem["hidden-timeout"] = config["decor-hidden-timeout"];
if (config["decor-autostart"]) decorSystem.start();

})();

