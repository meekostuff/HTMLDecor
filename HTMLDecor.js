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

var uc = function(str) { return str.toUpperCase(); }
var lc = function(str) { return str.toLowerCase(); }
var tagName = function(el) { return el.nodeType == 1 ? el.tagName.toLowerCase() : ""; }

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

var forSiblings = function(conf, refNode, fn) {
	if (!refNode || !refNode.parentNode) return;
	var node, stopNode, first = refNode.parentNode.firstChild;
	switch (lc(conf)) {
	case "starting": node = refNode; break;
	case "ending": node = first; stopNode = refNode.nextSibling; break;
	case "after": node = refNode.nextSibling; break;
	case "before": node = first; stopNode = refNode; break;
	default: throw conf + " is not a valid configuration in forSiblings";
	}
	if (!node) return;
	for (var next; next=node && node.nextSibling, node && node!=stopNode; node=next) fn(node);
}
var matchesElement = function(selector, node) { // WARN only matches by tagName
	var tag = lc(selector);
	var matcher = function(el) {
		return (el.nodeType == 1 && tagName(el) == tag);
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

var polyfill = function(doc) { // NOTE more stuff could be added here if *necessary*
	if (!doc) doc = document;
	if (!doc.head) doc.head = firstChild(doc.documentElement, "head");
}
polyfill();

/* Async functions
   delay(fn, timeout) makes one call to fn() after timeout ms (currently wraps window.setTimeout())
   defer(fn) makes one call to fn() at the next polling-interval
   queue(fn1, fn2, ...) will call (potentially async) functions sequentially
 */
var isolate = (function() {

var evType = vendorPrefix + "-isolate";
var testFn, complete = [], wrapper, isolate;
wrapper = function() {
	var i = complete.length;
	complete.push(false);
	testFn();
	complete[i] = true;
}
if (window.dispatchEvent) {
	window.addEventListener(evType, wrapper, false);
	isolate = function(fn) {
		testFn = fn;
		var e = document.createEvent("CustomEvent");
		e.initEvent("meeko-isolate", true, true);
		window.dispatchEvent(e);
		return complete.pop();
	}
}
else if ("onpropertychange" in document) {
	var meta = document.createElement("meta");
	meta[evType] = 0;
	meta.onpropertychange = wrapper;
	isolate = function(fn) { // by inserting meta every time, it doesn't matter if some code removes meta
		testFn = fn;
		if (!meta.parentNode) document.head.appendChild(meta);
		meta[evType]++;
		if (meta.parentNode) document.head.removeChild(meta);
		return complete.pop();
	}
}
else isolate = function(fn) {
	var complete = false;
	try { fn(); complete = true; }
	catch(error) { }
	return complete;
}

return isolate;
})();


var Callback = function() {
	var hooks = {}, complete = false;
	var cb = function(name) {
		if (complete) throw("Attempt to trigger callback after complete");
		complete = true;
		var fn = hooks[name];
		if (fn) {
			var args = [].splice.call(arguments, 0);
			isolate(function() { fn.apply(null, args); });
		}
	}
	extend(cb, {
		listen: function(name, fn) {
			if (hooks[name]) throw "Max of one hook per callback.";
			hooks[name] = fn;
			if (complete) fn();
		},
		isCallback: true
	});
	return cb;
}

function isCallback(obj) {
	return (obj && obj.isCallback);
}

var defer = (function() {
	
var timerId, callbacks;

function deferback() {
	var myCB, list = callbacks;
	callbacks = null;
	timerId = null;
	while ((myCB = list.shift())) {
		var cb = myCB.hook(myCB);
		if (isCallback(cb)) {
			if (myCB != cb) cb.listen("complete", myCB); // otherwise callback is delegated
			continue;
		}
		myCB("complete");
	}
}

function defer(fn) {
	if (!callbacks) callbacks = [];
	var myCB = Callback();
	myCB.hook = fn;
	callbacks.push(myCB);
	if (!timerId) timerId = window.setTimeout(deferback, config["polling-interval"]); // NOTE polling-interval is configured below
	return myCB;
}

return defer;

})();

var delay = function(fn, timeout) {
	var myCB = Callback();
	window.setTimeout(function() {
		var cb = fn(myCB);
		if (isCallback(cb)) {
			if (myCB != cb) cb.listen("complete", myCB); // otherwise callback is delegated
			return;
		}
		myCB("complete");
	}, timeout);
	return myCB;
}

var queue = (function() {
	
function queue() {
	var list = [], myCB = Callback(); 
	forEach(arguments, function(fn) {
		if (typeof fn != "function") throw "Non-function passed to queue()";
		list.push(fn);
	});
	var queueback = function() {
		var fn;
		while ((fn = list.shift())) {
			var cb = fn();
			if (isCallback(cb)) {
				cb.listen("complete", queueback);
				return;
			}
		}
		myCB("complete");
	}
	queueback();
	return myCB;
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
this[lc(name)] = function() { this._log({ level: num, message: arguments }); }

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

var log_index = logger["LOG_" + uc(config["log-level"])];
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

function getDecorLink(doc) {
	if (!doc) doc = document;
	var link = firstChild(doc.head, function(el) {
		return el.nodeType == 1 &&
			tagName(el) == "link" &&
			/\bMEEKO-DECOR\b/i.test(el.rel);
	});
	return link;
}

function getDecorMeta(doc) {
	if (!doc) doc = document;
	var meta = firstChild(doc.head, function(el) {
		return el.nodeType == 1 &&
			tagName(el) == "meta" &&
			/\bMEEKO-DECOR\b/i.test(el.name);
	});
	return meta;
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
	document.head.removeChild(style);
	// NOTE on IE sometimes content stays hidden although 
	// the stylesheet has been removed.
	// The following forces the content to be revealed
	var docBody = document.body;
	if (docBody) {
		docBody.style.visibility = "hidden";
		docBody.style.visibility = "";
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
		switch(lc(link.type)) { // FIXME this is just an assert currently
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
	if (getDecorMeta()) throw "Cannot decorate a document that has already been decorated";
	
	return queue(

	function() {
		var cb = Callback();
		loadURL(decorURL, {
			onSuccess: function(result) {
				doc = result;
				cb("complete");
			},
			onError: function(error) {
				logger.error("loadURL fail for " + url);
				throw "loadURL fail";				
			}
		});
		return cb;
	},
	function waitBody() {
		return document.body ? true : defer(waitBody);
	},
	function() {
		page_preprocess(document);
		marker = document.createElement("meta");
		marker.name = "meeko-decor";
		document.head.insertBefore(marker, document.head.firstChild);
		return decor_merge(doc, opts);
	},
	function() {
		addEvent(window, "click", function(e) {
			var target = e.target || e.srcElement;
			if (tagName(target) != "a") return;
			var url = resolveURL(target.getAttribute("href"));
			if (url.indexOf(document.URL + "#") == 0) return;
			// FIXME links to external sites
			navigate(url);
			if (e.preventDefault) e.preventDefault();
			else e.returnValue = false;
			return false;
		});
		// FIXME onpopstate
	}
	
	);
}

var navigate = function(url, opts) {
	var doc; 
	return queue(

	function() {
		var cb = Callback();
		history.pushState({}, null, url);
		loadURL(url, {
			onSuccess: function(result) {
				doc = result;
				cb("complete");
			},
			onError: function(error) {
				logger.error("loadURL fail for " + url);
				throw "loadURL fail";				
			}
		});
		return cb;
	},
	function() {
		var decorURL = resolveURL(getDecorLink().getAttribute("href"));
		var nextDecorLink = getDecorLink(doc);
		if (nextDecorLink && nextDecorLink.getAttribute("href") == decorURL) return page_merge(doc, opts);
		else (location.replace(url));
	}
	
	);	
}

var decor_merge = function(doc, opts) {
	if (typeof opts != "object") opts = {};
	var contentStart, decorEnd;
	return queue(

	function() {
		mergeHead(doc, true);
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

var page_merge = function(doc, opts) {
	if (typeof opts != "object") opts = {};
	return queue(
	function() {
		page_preprocess(doc);
	},
	function() {
		mergeHead(doc, false);
	},
	function() {
		var contentStart = doc.body.firstChild;
		if (contentStart) placeContent(contentStart, opts);
		return true;
	}

	);
}

function mergeHead(doc, isDecor) {
	var dstHead = document.head;
	var marker = getDecorMeta();
	if (!marker) throw "No meeko-decor marker found. ";

	// remove decor / page elements except for <script type=text/javascript>
	forSiblings (isDecor ? "before" : "after", marker, function(node) {
		if (tagName(node) == "script" && (!node.type || node.type.match(/^text\/javascript$/i))) return;
		dstHead.removeChild(node);
	});

	// remove duplicate scripts from srcHead
	var srcHead = doc.head;
	forSiblings ("starting", srcHead.firstChild, function(node) {
		switch(tagName(node)) {
		case "script":
			if (every($$("script", dstHead), function(el) {
				return resolveURL(el.src) != node.src;
			})) return;
			break;
		default: return;
		}
		srcHead.removeChild(node);
	});

	forSiblings ("starting", srcHead.firstChild, function(srcNode) {
		srcHead.removeChild(srcNode);
		if (srcNode.nodeType != 1) return;
		switch (tagName(srcNode)) {
		case "title":
			if (!srcNode.innerHTML) return; // IE will add a title even if non-existant
			var dstNode = firstChild(dstHead, "title");
			if (dstNode && dstNode.innerHTML) return;
			break;
		case "link": // FIXME no duplicates @rel, @href pairs
			break;
		case "meta": // FIXME no duplicates, warn on clash
			if (srcNode.httpEquiv) return;
			break;
		case "style": 
			break;
		case "script":  // FIXME no duplicate @src
			break;
		}
		if (isDecor) dstHead.insertBefore(srcNode, marker);
		else dstHead.appendChild(srcNode);
	});
	// allow scripts to run
	forEach($$("script", dstHead), enableScript);
}

function page_preprocess(doc) {
	var srcHead = doc.head;
	forSiblings ("starting", srcHead.firstChild, function(node) { // remove nodes that match specified conditions
		switch(tagName(node)) { 
		case "style": case "link":
			if (node.title.match(/^nodecor$/i)) break;
			return;
		default: return;
		}
		srcHead.removeChild(node);
	});
}

function placeContent(content, opts) { // this should work for content from both internal and external documents
	var srcBody = content.parentNode;
	forSiblings ("starting", content, function(node) { 
		var target;
		if (node.id && (target = $("#"+node.id)) != node) {
			// TODO compat check between node and target
			try { target.parentNode.replaceChild(node, target); } // NOTE fails in IE <= 8 if node is still loading
			catch (error) { return; }
			// TODO remove @role from node if an ancestor has same role
			if (opts.onContentPlaced) opts.onContentPlaced(node);
		}
		else try { srcBody.removeChild(node); } catch (error) {}
	});
}

function decor_insertBody(doc) {
	var dstBody = document.body,
	    srcBody = doc.body;
	var content = dstBody.firstChild;
	// NOTE remove non-empty text-nodes - 
	// they can't be hidden if that is appropriate
	forSiblings ("starting", srcBody.firstChild, function(node) {
		srcBody.removeChild(node);
		if (node.nodeType == 3 && !/\s*/.test(node.nodeValue)) {
			logger.warn("Removing text found as child of decor body.");
			return;
		}
		dstBody.insertBefore(node, content);
	});

	forSiblings ("before", content, function(node) {
		if (node.nodeType !== 1) return;
		if ("script" === tagName(node)) enableScript(node);
		else forEach($$("script", node), enableScript);
	});
}

var uriAttrs = {};
forEach(words("link@href a@href script@src img@src iframe@src video@src audio@src source@src form@action input@formaction button@formaction"), function(text) {
	var m = text.split("@"), tag = m[0], attrName = m[1];
	uriAttrs[tag] = attrName;
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
	each(uriAttrs, function(tag, attrName) {
		html = html.replace(RegExp("<" + tag + "\\b[^>]*>", "ig"), function(tagString) {
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

	var iframe = document.createElement("iframe");
	    docHead = document.head;
	iframe.name = "_decor";
	docHead.insertBefore(iframe, docHead.firstChild);
	var iframeDoc = iframe.contentWindow.document;

	iframeDoc.open();
	iframeDoc.write(html);
	iframeDoc.close();

	polyfill(iframeDoc);

	// DISABLED removeExecutedScripts(htmlDocument); 
	normalizeDocument(iframeDoc, url);

	forEach($$("style", iframeDoc.body), function(node) { // TODO support <style scoped>
		iframeDoc.head.appendChild(node);
	});
	
	// NOTE surprisingly this keeps a reference to the iframe documentElement
	// even after the iframe has been removed from the document.
	// Tested on FF11, O11, latest Chrome and Webkit, IE6-9
	var pseudoDoc = importDocument(iframeDoc);
	docHead.removeChild(iframe);
	
	each(uriAttrs, function(tag, attrName) {
		var vendorAttrName = vendorPrefix + "-" + attrName;
		forEach($$(tag, pseudoDoc.documentElement), function(el) {
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
	var docHead = doc.head;
	docHead.insertBefore(base, docHead.firstChild);
	
	function normalize(tag, attrName) { 
		var vendorAttrName = vendorPrefix + "-" + attrName;
		forEach($$(tag, doc), function(el) {
			var val = el.getAttribute(vendorAttrName);
			if (val && val.indexOf("#") != 0) el.setAttribute(vendorAttrName, resolveURL(val, doc)); // NOTE anchor hrefs aren't normalized
		});
	}
	each(uriAttrs, normalize);

	docHead.removeChild(base);
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
	    docHead = importNode(srcDoc.head),
		docBody = importNode(srcDoc.body);

	docEl.appendChild(docHead);
	for (var srcNode=srcDoc.head.firstChild; srcNode; srcNode=srcNode.nextSibling) {
		if (srcNode.nodeType != 1) continue;
		var node = importNode(srcNode);
		if (node) docHead.appendChild(node);
	}

	docEl.appendChild(docBody);
	docBody.innerHTML = srcDoc.body.innerHTML;
	var pseudoDoc = {
		documentElement: docEl,
		head: docHead,
		body: docBody
	}
	return pseudoDoc;
}

var importNode = document.importNode ? // NOTE only for single nodes, especially elements in <head>
function(srcNode) { 
	return document.importNode(srcNode, false);
} :
function(srcNode) { // document.importNode() NOT available on IE < 9
	if (srcNode.nodeType != 1) return;
	var tag = tagName(srcNode);
	var node = document.createElement(tag);
	copyAttributes(node, srcNode);
	switch(tag) {
	case "title":
		if (tagName(node) == "title" && node.innerHTML == "") node = null;
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
	copyAttributes(script, node);
	script.type = "text/javascript";
	
	// FIXME is this comprehensive?
	try { script.innerHTML = node.innerHTML; }
	catch (error) { script.text = node.text; }

	node.parentNode.replaceChild(script, node);
}

}); // end decorSystem defn

decorSystem["hidden-timeout"] = config["decor-hidden-timeout"];
if (config["decor-autostart"]) decorSystem.start();

})();

