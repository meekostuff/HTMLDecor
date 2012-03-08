/*!
 * Copyright 2009-2012 Sean Hogan (http://meekostuff.net/)
 * Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
 */

// TODO Move script and options detection outside of the decorSystem module
// Eventually logger and decorSystem could be in separate modules
// and built into this script.

// FIXME for IE7, IE8 sometimes XMLHttpRequest is in a detectable but not callable state
// This is usually fixed by refreshing, or by the following work-around.
// OTOH, maybe my IE installation is bad
var XMLHttpRequest = window.XMLHttpRequest; 

(function() {

// NOTE if HTMLDecor is included in a decor document then abort 
if (window.name == "_decor") return; 

// or if "nodecor" is one of the search options
if (/(^\?|&)nodecor($|&)/.test(location.search)) return; // WARN deprecated

var defaults = { // NOTE defaults also define the type of the associated config option
	"log-level": "warn",
	"decor-autostart": true,
	"decor-hidden-timeout": 3000,
	"polling-interval": 50
}
var vendorPrefix = "meeko"; // NOTE added as prefix for url-options, and *Storage
var modulePrefix = "decor"; // NOTE removed as prefix for data-* attributes

/*
 ### Utility functions
 */

var document = window.document;

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

var words = function(text) { return text.split(/\s+/); }

var each = function(object, fn) {
	for (slot in object) {
		if (object.hasOwnProperty && object.hasOwnProperty(slot)) fn(slot, object[slot]);
	}
}

var extend = function(dest, src) {
	each(src, function(key, val) { dest[key] = val; });
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
	context = context || document;
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

if (!document.head) document.head = firstChild(document, "head");

/* Async functions
   delay(fn, timeout) makes one call to fn() after timeout ms (currently wraps window.setTimeout())
   defer(fn) makes one call to fn() at the next polling-interval
   queue(fn1, fn2, ...) will call (potentially async) functions sequentially
 */
var Callback = function() {
	var external = this, hooks = [], complete = false;
	extend(external, {
		add: function(fn) {
			hooks.push(fn);
			if (complete) fn();
		}
	});
	var cb = function() {
		if (complete) throw "Attempt to trigger callback after complete";
		complete = true;
		for (var i=0, n=hooks.length; i<n; i++) hooks[i]();
	}
	cb.external = external;
	return cb;
}

function isCallback(obj) {
	return (obj instanceof Callback);
}

var defer = (function() {
	
var timerId, callbacks;

function deferback() {
	var callback, list = callbacks;
	callbacks = null;
	timerId = null;
	while ((callback = list.shift())) {
		var cb = callback.hook();
		if (isCallback(cb)) cb.add(callback);
		else callback();
	}
}

function defer(fn) {
	if (!callbacks) callbacks = [];
	var callback = new Callback();
	callback.hook = fn;
	callbacks.push(callback);
	if (!timerId) timerId = window.setTimeout(deferback, config["polling-interval"]); // NOTE polling-interval is configured below
	return callback.external;
}

return defer;

})();

var delay = function(fn, timeout) {
	var callback = new Callback();
	window.setTimeout(function() {
		var cb = fn();
		if (isCallback(cb)) cb.add(callback);
		else callback();
	}, timeout);
	return callback.external;
}

var queue = (function() {
	
function queue() {
	var list = [], callback = new Callback();
	forEach(arguments, function(fn) {
		if (typeof fn != "function") throw "Non-function passed to queue()";
		list.push(fn);
	});
	var queueback = function() {
		var fn;
		while ((fn = list.shift())) {
			var cb = fn();
			if (isCallback(cb)) {
				cb.add(queueback);
				return;
			}
		}
		callback();
	}
	queueback();
	return callback.external;
}

return queue;

})();

/*
 ### Get config options
*/

var script = last($$("script")); // WARN this wouldn't be valid if script is dynamically inserted

var getOptions = function() {
	var search = location.search,
		options = {}; 
	if (search) search.substr(1).replace(/(?:^|&)([^&=]+)=?([^&]*)/g, function(m, key, val) { if (m) options[key] = val; });
	return options;
}
var urlQuery = getOptions();

var dataSources = [];
dataSources.push( function(name) { return urlQuery[vendorPrefix+"-"+name]; } );
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

var levels = words("NONE ERROR WARN INFO DEBUG");

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

// NOTE resolveURL shouldn't be needed, or at least
// el.setAttribute(attr, el[attr]) should suffice.
// But IE doesn't return relative URLs for <link>, and
// does funny things on anchors
var resolveURL = function(relURL, context) {
	if (!context) context = document;
	var div = context.createElement("div");
	if (context != document) context.body.appendChild(div); // WARN assumes context.body exists
	div.innerHTML = '<a href="'+ relURL + '"></a>';	
	var href = div.firstChild.href;
	if (div.parentNode) div.parentNode.removeChild(div);
	return href;
}

sys.complete = false;

var readyStateLookup = {
	"uninitialized": false,
	"loading": false,
	"interactive": false,
	"loaded": true, // TODO is this correct??
	"complete": true
}

var domContentLoaded = (function() {

var loaded = false;
if (!document.readyState) {
	addEvent(document, "DOMContentLoaded", function() { loaded = true; });
	addEvent(window, "load", function() { loaded = true; });
}
function domContentLoaded() { 
	return loaded || readyStateLookup[document.readyState];
}
return domContentLoaded;

})();

function getDecorLink() {
	var decorLink = firstChild(document.head, function(el) {
		return el.nodeType == 1 &&
			el.tagName.toLowerCase() == "link" &&
			/\bMEEKO-DECOR\b/i.test(el.rel);
	});
	return decorLink;
}

var Anim = (function() {
	
var fragment = document.createDocumentFragment();
var style = document.createElement("style");
fragment.appendChild(style); // NOTE on IE this realizes style.styleSheet 

// NOTE hide the page until the decor is ready
if (style.styleSheet) style.styleSheet.cssText = "body { visibility: hidden; }";
else style.textContent = "body { visibility: hidden; }";
var hidden = false;
var unhiding = true;
function hide() {
	var timeout = sys["hidden-timeout"];
	if (timeout <= 0) return;
	document.head.insertBefore(style, script);
	hidden = true;
	unhiding = false;
	delay(_unhide, timeout);
}
function unhide() {
	if (unhiding) return;
	unhiding = true;
	(function detect() {
		if (checkStyleSheets()) defer(_unhide);
		else defer(detect);
	})();
}
function _unhide() {
	if (!hidden) return;
	hidden = false;
	var head = document.head,
	    body = document.body;
	head.removeChild(style);
	// NOTE on IE sometimes content stays hidden although 
	// the stylesheet has been removed.
	// The following forces the content to be revealed
	if (body) {
		body.style.visibility = "hidden";
		body.style.visibility = "";
	}
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

return {
	hide: hide,
	unhide: unhide
}

})();



var start = sys.start = function() {
	var contentPlaced = false, link;
	Anim.hide();

	return queue(

	function searchDecorLink() {
		link = getDecorLink();
		if (!link && !document.body) return defer(searchDecorLink);
		return link;
	},
	function() {
		if (!link) return true;
		var decorURL = resolveURL(link.getAttribute("href"));
		var type = link.type.toLowerCase();
		switch(type) { // FIXME this is just an assert currently
		case "text/html": case "":
			break;
		default:
			logger.error("Invalid decor document type: " + type);
			throw "Invalid document type";
			break;
		}
		return decorate(decorURL, {
			onContentPlaced: function() { Anim.unhide(); }
		});
	},
	function() {
		sys.complete = true;
	}
	
	);
}

var decorate = function(decorURL, opts) {
	var doc; 
	return queue(

	function() {
		var cb = new Callback();
		loadURL(decorURL, {
			onSuccess: function(result) {
				doc = result;
				cb();
			},
			onError: function(error) {
				logger.error("loadURL fail for " + url);
				throw "loadURL fail";				
			}
		});
		return cb.external;
	},
	function() {
		return decor_merge(doc, opts);
	}
	
	);
}

var decor_merge = function(doc, opts) {
	if (typeof opts != "object") opts = {};
	var contentStart, decorEnd;
	return queue(

	function() {
		decor_mergeHead(doc);
	},
	function() {
		contentStart = document.body.firstChild;
		decor_insertBody(doc);
		decorEnd = document.createTextNode("");
		document.body.insertBefore(decorEnd, contentStart);
	},
	function process_content() {
		contentStart = decorEnd.nextSibling;
		if (contentStart) placeContent(contentStart, opts);
		if (!domContentLoaded()) return defer(process_content);
		return true;
	}

	);
}

var uriAttrs = {};
forEach(words("link@href a@href script@src img@src iframe@src video@src audio@src source@src form@action input@formaction button@formaction"), function(text) {
	var m = text.split("@"), tagName = m[0], attrName = m[1];
	uriAttrs[tagName] = attrName;
});

var loadURL = function(url, opts) {
	var xhr = window.XMLHttpRequest ?
		new XMLHttpRequest() :
		new ActiveXObject("Microsoft.XMLHTTP");
	xhr.onreadystatechange = function() {
		if (xhr.readyState != 4) return;
		if (xhr.status != 200) opts.onError(xhr.status); // FIXME what should status be??
		else parseHTML(xhr.responseText, url, opts);
	}
	xhr.open("GET", url, true);
	xhr.send("");
}

var parseHTML = function(html, url, opts) {
	// prevent resources (<img>, <link>, etc) from loading in parsing context
	each(uriAttrs, function(tagName, attrName) {
		html = html.replace(RegExp("<" + tagName + "\\b[^>]*>", "ig"), function(tagString) {
			var vendorAttrName = vendorPrefix + "-" + attrName;
			return tagString.replace(RegExp("\\b" + attrName + "=", "i"), vendorAttrName + "=");
		});		
	});
	
	// disable <script>
	// TODO currently handles script @type=""|"text/javascript"
	// What about "application/javascript", etc??
	html = html.replace(/<script\b[^>]*>/ig, function(tag) {
		if (/\btype=['"]?text\/javascript['"]?(?=\s|\>)/i.test(tag)) {
			return tag.replace(/\btype=['"]?text\/javascript['"]?(?=\s|\>)/i, 'type="text/javascript?async"');
		}
		return tag.replace(/\>$/, ' type="text/javascript?async">');
	});

	var iframe = document.createElement("iframe"),
	    head = document.head;
	iframe.name = "_decor";
	document.head.insertBefore(iframe, head.firstChild);
	var iframeDoc = iframe.contentWindow.document;

	iframeDoc.open();
	iframeDoc.write(html);
	iframeDoc.close();

	if (!iframeDoc.head) iframeDoc.head = firstChild(iframeDoc.documentElement, "head");

	// DISABLED removeExecutedScripts(htmlDocument); 
	normalizeDocument(iframeDoc, url);

	forEach($$("style", iframeDoc.body), function(node) { // TODO support <style scoped>
		iframeDoc.head.appendChild(node);
	});
	
	// NOTE surprisingly this keeps a reference to the iframe documentElement
	// even after the iframe has been removed from the document.
	// Tested on FF11, O11, latest Chrome and Webkit, IE6-9
	var pseudoDoc = importDocument(iframeDoc);
	head.removeChild(iframe);
	
	each(uriAttrs, function(tagName, attrName) {
		var vendorAttrName = vendorPrefix + "-" + attrName;
		forEach($$(tagName, pseudoDoc.documentElement), function(el) {
			var val = el.getAttribute(vendorAttrName);
			if (!val) return;
			el.setAttribute(attrName, val);
			el.removeAttribute(vendorAttrName);
		});	
	})

	opts.onSuccess && opts.onSuccess(pseudoDoc);

	// FIXME need warning for doc property mismatches between page and decor
	// eg. charset, doc-mode, content-type, etc
}

function normalizeDocument(doc, baseURL) {
	// insert <base href=baseURL> at top of <head>
	var base = doc.createElement("base");
	base.setAttribute("href", baseURL);
	var head = doc.head;
	head.insertBefore(base, head.firstChild);
	
	function normalize(tagName, attrName) { 
		var vendorAttrName = vendorPrefix + "-" + attrName;
		forEach($$(tagName, doc), function(el) {
			var val = el.getAttribute(vendorAttrName);
			if (val && val.indexOf("#") != 0) el.setAttribute(vendorAttrName, resolveURL(val, doc)); // NOTE anchor hrefs aren't normalized
		});
	}
	each(uriAttrs, normalize);

	head.removeChild(base);
}

var copyAttributes = function(node, srcNode) { // implements srcNode.cloneNode(false)
	var attrs = srcNode.attributes;
	forEach(attrs, function(attr) {
		if (!attr.specified) return;
		node.setAttribute(attr.name, attr.value);
	});
	return node;
}

var importDocument = document.importNode ? // NOTE returns a pseudoDoc
function(srcDoc) {
	var docEl = document.importNode(srcDoc.documentElement, true);
	var pseudoDoc = {
		documentElement: docEl,
		head: firstChild(docEl, "head"),
		body: firstChild(docEl, "body")
	}
	// WARN sometimes IE9 doesn't read the content of inserted <style>
	forEach($$("style", docEl), function(node) {
		if (node.styleSheet && node.styleSheet.cssText == "") node.styleSheet.cssText = node.innerHTML;		
	});
	
	return pseudoDoc;
} :
function(srcDoc) {
	var docEl = importNode(srcDoc.documentElement),
	    head = importNode(srcDoc.head),
		body = importNode(srcDoc.body);

	docEl.appendChild(head);
	for (var srcNode=srcDoc.head.firstChild; srcNode; srcNode=srcNode.nextSibling) {
		if (srcNode.nodeType != 1) continue;
		var node = importNode(srcNode);
		if (node) head.appendChild(node);
	}

	docEl.appendChild(body);
	body.innerHTML = srcDoc.body.innerHTML;
	var pseudoDoc = {
		documentElement: docEl,
		head: head,
		body: body
	}
	return pseudoDoc;
}

var importNode = document.importNode ? // NOTE only for single nodes, especially elements in <head>
function(srcNode) { 
	return document.importNode(srcNode, false);
} :
function(srcNode) { // document.importNode() NOT available on IE < 9
	var tagName = srcNode.tagName.toLowerCase();
	var node = document.createElement(tagName);
	copyAttributes(node, srcNode);
	switch(tagName) {
	case "title":
		if (node.tagName.toLowerCase() == "title" && node.innerHTML == "") node = null;
		else node.innerText = srcNode.innerHTML;
		break;
	case "style":
		var frag = document.createDocumentFragment();
		frag.appendChild(node);
		node.styleSheet.cssText = srcNode.styleSheet.cssText;
		frag.removeChild(node);
		break;
	case "script":
		node.text = srcNode.text;
		break;
	default: // meta, link have no content
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

function decor_mergeHead(doc) {
	var head = document.head;
	var node, next;
	for (node=head.firstChild; next=node && node.nextSibling, node; node=next) {
		if (node.nodeType != 1) continue;
		if (!node.tagName.match(/^(style|link)$/i)) continue;
		if (!node.title.match(/^nodecor$/i)) continue;
		head.removeChild(node);
	}

	var marker = head.firstChild;
	var wHead = doc.head;
	var wBody = doc.body;
	for (var wNode; wNode=wHead.firstChild;) {
		wHead.removeChild(wNode);
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
		head.insertBefore(wNode, marker);
	}
	// allow scripts to run
	forEach($$("script", head), enableScript);
}

function placeContent(content, opts) { // this should work for content from both internal and external documents
	var node = content, next, body = content.parentNode;
	for (next=node.nextSibling; node; (node=next) && (next=next.nextSibling)) {
		var target;
		if (node.id && (target = $("#"+node.id)) != node) {
			// TODO compat check between node and target
			try { target.parentNode.replaceChild(node, target); } // NOTE fails in IE <= 8 if node is still loading
			catch (error) { break; }
			// TODO remove @role from node if an ancestor has same role
			if (opts.onContentPlaced) opts.onContentPlaced(node);
		}
		else body.removeChild(node);
	}
}


function decor_insertBody(doc) {
	var body = document.body,
	    wBody = doc.body;
	// NOTE remove non-empty text-nodes - 
	// they can't be hidden if that is appropriate
	for (var node=wBody.firstChild, next=node.nextSibling; next; node=next, next=node.nextSibling) { 
		if (node.nodeType != 3) continue;
		if (/\s*/.test(node.nodeValue)) continue;
		logger.warn("Removing text found as child of decor body.");
		wBody.removeChild(node);
	}
	var content = body.firstChild;
	for (var wNode; wNode=wBody.firstChild;) {
		body.insertBefore(wNode, content);
	}

	for (node=body.firstChild; next=node.nextSibling, node!=content; node=next) {
		if (node.nodeType !== 1) continue;
		if ("script" === node.tagName.toLowerCase()) enableScript(node);
		else forEach($$("script", node), enableScript);
	}
}

}); // end decorSystem defn

decorSystem["hidden-timeout"] = config["decor-hidden-timeout"];
if (config["decor-autostart"]) decorSystem.start();

})();

