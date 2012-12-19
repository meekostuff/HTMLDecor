/*!
 * Copyright 2009-2012 Sean Hogan (http://meekostuff.net/)
 * Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
 */

// TODO Move script and options detection outside of the decor module
// Eventually logger and decor could be in separate modules
// and built into this script.

// TODO substantial error handling and notification needs to be added
// Also more isolation.
// <link rel="meeko-base" />

// FIXME Is javascript even supported for different media devices? 
// e.g. will <link rel="meeko-decor" media="print" /> even work?

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
	"decor-theme": "",
	"decor-hidden-timeout": 3000,
	"polling-interval": 50
}

var vendorPrefix = "meeko";
var modulePrefix = "decor";

var Meeko = window.Meeko || (window.Meeko = {});

/*
 ### Utility functions
 */

var document = window.document;

var uc = function(str) { return str.toUpperCase(); }
var lc = function(str) { return str.toLowerCase(); }

var remove = function(a, item) {
	for (var n=a.length, i=0; i<n; i++) {
		if (a[i] !== item) continue;
		a.splice(i, 1);
		return;
	}	
}
var forEach = ([].forEach) ?  // TODO is this feature detection worth-while?
function(a, fn, context) { return [].forEach.call(a, fn, context); } :
function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) fn.call(context, a[i], i, a); }

var every = ([].every) ?  // TODO is this feature detection worth-while?
function(a, fn, context) { return [].every.call(a, fn, context); } :
function(a, fn, context) { 
	for (var n=a.length, i=0; i<n; i++) {
		if (!fn.call(context, a[i], i, a)) return false; 
	}
	return true;
}

var words = function(text) { return text.split(/\s+/); }

var each = (Object.keys) ? // TODO is this feature detection worth-while?
function(object, fn) {
	var keys = Object.keys(object);
	for (var n=keys.length, i=0; i<n; i++) {
		var key = keys[i];
		fn(key, object[key]);
	}
} : 
function(object, fn) {
	for (slot in object) {
		if (object.hasOwnProperty && object.hasOwnProperty(slot)) fn(slot, object[slot]);
	}
}

var extend = function(dest, src) {
	each(src, function(key, val) { dest[key] = val; });
	return dest;
}

var trim = ''.trim ?
function(str) { return str.trim(); } :
function(str) { return str.replace(/^\s+/, '').replace(/\s+$/, ''); }

var parseJSON = (window.JSON && JSON.parse) ?
function(text) {
	try { return JSON.parse(text); }
	catch (error) { return; }
} :
function(text) {
	try { return ( Function('return ( ' + text + ' );') )(); }
	catch (error) { return; }
}

if (!Meeko.stuff) Meeko.stuff = {}
extend(Meeko.stuff, {
	uc: uc, lc: lc, forEach: forEach, every: every, words: words, each: each, extend: extend, trim: trim, parseJSON: parseJSON
});

/*
 ### Async functions
   wait(test) waits until test() returns true
   until(test, fn) repeats call to fn() until test() returns true
   delay(fn, timeout) makes one call to fn() after timeout ms
   queue([fn1, fn2, ...]) will call (potentially async) functions sequentially
 */
var isolate = (function() { // TODO maybe it isn't worth isolating on platforms that don't have dispatchEvent()

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
	this.isCallback = true;
	this.called = false;
}

extend(Callback.prototype, {

complete: function() {
	if (this.called) throw "Callback has already been called";
	this.called = true;
	if (this.onComplete) this.onComplete.apply(this, arguments);
},

error: function() {
	if (this.called) throw "Callback has already been called";
	this.called = true;
	if (this.onError) this.onError.apply(this, arguments);
},

abort: function() { // NOTE abort could trigger an error, but there is an expectation that whatever context calls abort will be handling that anyway
	if (this.called) throw "Callback has already been called";
	this.called = true;
	if (this.onAbort) this.onAbort.apply(this, arguments); // TODO isolate
}

});

function isCallback(obj) {
	return (obj && obj.isCallback);
}

var async = function(fn) {
	var wrapper = function() {
		var nParams = fn.length, nArgs = arguments.length;
		if (nArgs > nParams) throw "Too many parameters in async call";
		var inCB = arguments[nParams - 1], cb;
		if (isCallback(inCB)) cb = inCB;
		else switch (typeof inCB) {
			case "undefined": case "null":
				cb = new Callback();
				break;
			case "function":
				cb = new Callback();
				cb.onComplete = inCB;
				break;
			case "object":
				if (inCB.onComplete) {
					cb = new Callback();
					cb.onComplete = inCB.onComplete;
					cb.onError = inCB.onError;
					break;
				}
				// else fall-thru to error
			default:
				throw "Invalid callback parameter in async call";
				break;
		}
		var params = [].slice.call(arguments, 0);
		params[nParams - 1] = cb;
		var result = fn.apply(this, params);
		if (result) delay(function() { cb.complete(result) });
		return cb;
	}
	wrapper.isAsync = true;
	return wrapper;
}

var wait = (function() {
	
var timerId, callbacks = [];

function waitback() {
	var waitCB, i = 0;
	while ((waitCB = callbacks[i])) {
		var hook = waitCB.hook;
		var done, success;
		success = isolate(function() { done = hook(); });
		if (!success) {
			callbacks.splice(i,1);
			waitCB.error();
		}
		else if (done) {
			callbacks.splice(i,1);
			waitCB.complete();
		}
		else i++;
	}
	if (!callbacks.length) {
		window.clearInterval(timerId);
		timerId = null;
	}
}

var wait = async(function(fn, waitCB) {
	waitCB.hook = fn;
	callbacks.push(waitCB);
	if (!timerId) timerId = window.setInterval(waitback, config["polling-interval"]); // NOTE polling-interval is configured below
	waitCB.onAbort = function() { remove(callbacks, waitCB); }
});

return wait;

})();

var until = function(test, fn, untilCB) {
	return wait(function() { fn(); return test(); }, untilCB);
}

var delay = async(function(fn, timeout, delayCB) {
	var timerId = window.setTimeout(function() {
		var result;
		var success = isolate(function() { result = fn(delayCB); });
		if (!success) {
			delayCB.error();
			return;
		}
		else if (isCallback(result)) {
			if (delayCB == result) return; // callback is delegated
			result.onComplete = delayCB.onComplete;
			result.onError = delayCB.onError;
		}
		else delayCB.complete(result);
	}, timeout);
	delayCB.onAbort = function() { window.clearTimeout(timerId); }
});

var queue = async(function(fnList, queueCB) {
	var list = [], innerCB;
	forEach(fnList, function(fn) {
		if (typeof fn != "function") throw "Non-function passed to queue()";
		list.push(fn);
	});
	var queueback = function() {
		var fn;
		while ((fn = list.shift())) {
			var success = isolate(function() { innerCB = fn(); });
			if (!success) {
				queueCB.error();
				return;
			}
			if (isCallback(innerCB)) {
				innerCB.onComplete = queueback;
				innerCB.onError = function() { queueCB.error(); }
				return;
			}
		}
		queueCB.complete();
	}
	queueCB.onAbort = function() {
		if (isCallback(innerCB)) innerCB.abort();
		list = [];
	}
	queueback();
});

extend(Callback, {
	isCallback: isCallback, async: async, delay: delay, wait: wait, until: until, queue: queue
});
Meeko.Callback = Callback;

/*
 ### DOM utility functions
 */
var tagName = function(el) { return el.nodeType == 1 ? lc(el.tagName) : ""; }

var $id = function(id, context) {
	if (!context) context = document;
	else if (context.nodeType != 9) context = context.ownerDocument;
	if (!id) return;
	var node = context.getElementById(id);
	if (!node) return;
	if (node.id == id) return node;
	// work around for broken getElementById in old IE
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
var replaceNode = function(current, next) {
	if (document.adoptNode) next = document.adoptNode(next); // Safari 5 was throwing because imported nodes had been added to a document node
	current.parentNode.replaceChild(next, current);
	return current;
}

var copyAttributes = function(node, srcNode) { // implements srcNode.cloneNode(false)
	var attrs = srcNode.attributes;
	forEach(attrs, function(attr) {
		if (!attr.specified) return;
		node.setAttribute(attr.name, attr.value);
	});
	return node;
}

var createDocument =
document.implementation.createHTMLDocument && function() {
	var doc = document.implementation.createHTMLDocument("");
	doc.removeChild(doc.documentElement);
	return doc;
} ||
document.createDocumentFragment().getElementById && function() { return document.createDocumentFragment(); } || // IE <= 8 
function() { return document.cloneNode(false); } 

var scrollToId = function(id) {
	if (id) {
		var el = $id(id);
		if (el) el.scrollIntoView(true);
	}
	else window.scroll(0, 0);
	document.documentElement.scrollHeight; // force page reflow
}

var addEvent = 
	document.addEventListener && function(node, event, fn) { return node.addEventListener(event, fn, false); } ||
	document.attachEvent && function(node, event, fn) { return node.attachEvent("on" + event, fn); } ||
	function(node, event, fn) { node["on" + event] = fn; }

var removeEvent = 
	document.removeEventListener && function(node, event, fn) { return node.removeEventListener(event, fn, false); } ||
	document.detachEvent && function(node, event, fn) { return node.detachEvent("on" + event, fn); } ||
	function(node, event, fn) { if (node["on" + event] == fn) node["on" + event] = null; }

var URI = (function() {

var URI = function(str) {
	if (!(this instanceof URI)) return new URI(str);
	this.parse(str);
}

var keys = ["source","protocol","host","hostname","port","pathname","search","hash"];
var parser = /^([^:\/?#]+:)?(?:\/\/(([^:\/?#]*)(?::(\d*))?))?([^?#]*)?(\?[^#]*)?(#.*)?$/;

URI.prototype.parse = function parse(str) {
	str = trim(str);
	var	m = parser.exec(str);

	for (var n=keys.length, i=0; i<n; i++) this[keys[i]] = m[i] || '';
	this.href = str;
	this.supportsResolve = /http:|https:|ftp:|file:/.test(this.protocol);
	if (!this.supportsResolve) return;
	if (this.pathname == '') this.pathname = '/';
	this.nopathname = this.protocol + (this.supportsResolve ? '//' : '') + this.host;
	this.basepath = this.pathname.replace(/[^\/]*$/,'');
	this.base = this.nopathname + this.basepath;
	this.nosearch = this.nopathname + this.pathname;
	this.nohash = this.nosearch + this.search;
	this.href = this.nohash + this.hash;
};

URI.prototype.resolve = function resolve(relURL) {
	relURL = trim(relURL);
	if (!this.supportsResolve) return relURL;
	var substr1 = relURL.charAt(0), substr2 = relURL.substr(0,2);
	var absURL =
		/^[a-zA-Z0-9-]+:/.test(relURL) ? relURL :
		substr2 == '//' ? this.protocol + relURL :
		substr1 == '/' ? this.nopathname + relURL :
		substr1 == '?' ? this.nosearch + relURL :
		substr1 == '#' ? this.nohash + relURL :
		substr1 != '.' ? this.base + relURL :
		substr2 == './' ? this.base + relURL.replace('./', '') :
		(function() {
			var myRel = relURL;
			var myDir = this.basepath;
			while (myRel.substr(0,3) == '../') {
				myRel = myRel.replace('../', '');
				myDir = myDir.replace(/[^\/]+\/$/, '');
			}
			return this.nopathname + myDir + myRel;
		}).call(this);
	return absURL;
}


return URI;

})();

var loadHTML = async(function(url, cb) {
	var DOM = this;
	var xhr = window.XMLHttpRequest ?
		new XMLHttpRequest() :
		new ActiveXObject("Microsoft.XMLHTTP");
	xhr.onreadystatechange = function() {
		if (xhr.readyState != 4) return;
		delay(function() { // Use delay to stop the readystatechange event interrupting other event handlers (on IE). 
			if (xhr.status != 200) cb.error(xhr.status); // FIXME what should status be??
			var doc = DOM.parseHTML(xhr.responseText, url);
			cb.complete(doc);
		});
	}
	xhr.open("GET", url, true);
	xhr.send("");
});

var srcAttrs = {}, hrefAttrs = {};
forEach(words("link@<href script@<src img@<src iframe@<src video@<src audio@<src source@<src a@href area@href q@cite blockquote@cite ins@cite del@cite form@action input@formaction button@formaction"), function(text) {
	var m = text.split("@"), tag = m[0], attrName = m[1];
	if (attrName.charAt(0) == '<') srcAttrs[tag] = attrName.substr(1);
	else hrefAttrs[tag] = attrName;
});

var parseHTML = (function() {

function parseHTML(html, url) {
	
	// prevent resources (<img>, <link>, etc) from loading in parsing context, by renaming @src, @href to @meeko-src, @meeko-href
	var disableURIs = function(tag, attrName) {
		var vendorAttrName = vendorPrefix + "-" + attrName;
		html = html.replace(RegExp("<" + tag + "\\b[^>]*>", "ig"), function(tagString) {
			return tagString.replace(RegExp("\\b" + attrName + "=", "i"), vendorAttrName + "=");
		});
	}
	each(hrefAttrs, disableURIs);
	each(srcAttrs, disableURIs);
	
	// disable <script>
	// TODO currently handles script @type=""|"text/javascript"
	// What about "application/javascript", etc??
	html = html.replace(/<script\b[^>]*>/ig, function(tag) {
		if (/\btype=['"]?text\/javascript['"]?(?=\s|\>)/i.test(tag)) {
			return tag.replace(/\btype=['"]?text\/javascript['"]?(?=\s|\>)/i, 'type="text/javascript?disabled"');
		}
		return tag.replace(/\>$/, ' type="text/javascript?disabled">');
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

	var baseURI = URI(url);
	
	// TODO not really sure how to handle <base href="..."> already in doc.
	// For now just honor them if present
	var base;
	forEach ($$("base", iframeDoc.head), function(node) {
		if (!node.getAttribute("href")) return;
		base = iframeDoc.head.removeChild(node);
	});
	if (base) baseURI = URI(baseURI.resolve(base.getAttribute('href')));
	
	forEach($$("style", iframeDoc.body), function(node) { // TODO support <style scoped>
		iframeDoc.head.appendChild(node);
	});
	
	var pseudoDoc = importDocument(iframeDoc);
	docHead.removeChild(iframe);

	function enableURIs(tag, attrName) { 
		var vendorAttrName = vendorPrefix + "-" + attrName;
		forEach($$(tag, pseudoDoc), function(el) {
			var relURL = el.getAttribute(vendorAttrName);
			if (relURL == null) return;
			el.removeAttribute(vendorAttrName);
			var mod = relURL.charAt(0);
			var absURL =
				('' == mod) ? relURL : // empty, but not null
				('#' == mod) ? relURL : // NOTE anchor hrefs aren't normalized
				('?' == mod) ? relURL : // NOTE query hrefs aren't normalized
				baseURI.resolve(relURL);
			el.setAttribute(attrName, absURL);
		});
	}
	each(hrefAttrs, enableURIs);
	each(srcAttrs, enableURIs);

	// FIXME need warning for doc property mismatches between page and decor
	// eg. charset, doc-mode, content-type, etc
	return pseudoDoc;
}

var importDocument = document.importNode ? // NOTE returns a pseudoDoc
function(srcDoc) {
	var docEl = document.importNode(srcDoc.documentElement, true);
	var doc = createDocument();
	doc.appendChild(docEl);
	polyfill(doc);
	// WARN sometimes IE9 doesn't read the content of inserted <style>
	forEach($$("style", doc), function(node) {
		if (node.styleSheet && node.styleSheet.cssText == "") node.styleSheet.cssText = node.innerHTML;		
	});
	
	return doc;
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
	
	/*
	 * WARN on IE6 `element.innerHTML = ...` will drop all leading <script>'s
	 * Work-around this by prepending some benign element to the src <body>
	 * and removing it from the dest <body> after the copy is done
	 */
	var srcBody = srcDoc.body;
	srcBody.insertBefore(srcDoc.createElement('wbr'), srcBody.firstChild);
	docBody.innerHTML = srcDoc.body.innerHTML; 
	docBody.removeChild(docBody.firstChild); // TODO assert firstChild.tagName == 'wbr'

	var doc = createDocument();
	doc.appendChild(docEl);
	polyfill(doc);
	return doc;
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
	default: // meta, link, base have no content
		// FIXME what to do with <base>?
		break;
	}
	return node;
}

return parseHTML;

})();


var polyfill = function(doc) { // NOTE more stuff could be added here if *necessary*
	if (!doc) doc = document;
	if (!doc.head) doc.head = firstChild(doc.documentElement, "head");
}

var DOM = Meeko.DOM || (Meeko.DOM = {});
extend(DOM, {
	$id: $id, $$: $$, tagName: tagName, forSiblings: forSiblings, matchesElement: matchesElement, firstChild: firstChild,
	replaceNode: replaceNode, scrollToId: scrollToId, addEvent: addEvent, removeEvent: removeEvent, createDocument: createDocument,
	URI: URI, loadHTML: loadHTML, parseHTML: parseHTML, copyAttributes: copyAttributes,
	polyfill: polyfill
});


polyfill();

/*
 ### Get config options
*/

var getOptions = function() {
	var search = location.search,
		options = {}; 
	if (search) search.substr(1).replace(/(?:^|&)([^&=]+)=?([^&]*)/g, function(m, key, val) { if (m) options[key] = decodeURIComponent(val); });
	return options;
}
var urlQuery = getOptions();

var dataSources = [];
var queryConfig = parseJSON(urlQuery[vendorPrefix+'-config']);
if (queryConfig) dataSources.push( function(name) { return queryConfig[name]; } );
if (window.sessionStorage) {
	var sessionConfig = parseJSON(sessionStorage.getItem(vendorPrefix + "-config"));
	if (sessionConfig) dataSources.push( function(name) { return sessionConfig[name]; } );
}
if (window.localStorage) {
	var localConfig = parseJSON(localStorage.getItem(vendorPrefix + "-config"));
	if (localConfig) dataSources.push( function(name) { return localConfig[name]; } );
}
if (Meeko.config) dataSources.push( function(name) { return Meeko.config[name]; } )

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

var logger = Meeko.logger || (Meeko.logger = new function() {

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

var decor = Meeko.decor || (Meeko.decor = new function() {

var decor = this;

extend(decor, {
	contentURL: "",
	placeHolders: {},
	"hidden-timeout": 0
});

extend(decor, {

start: function() {
	var decor = this;
	var decorURL = getDecorURL(document);
	if (!decorURL) return; // FIXME warning message
	return queue([

	function() {
		return decor.decorate(decorURL);
	},
	function() {
		decor.contentURL = URI(document.URL).nohash;
		addEvent(window, "unload", decor.onUnload);
		
		if (!history.pushState) return;
		
		history.replaceState({"meeko-decor": true }, null); // otherwise there will be no popstate when returning to original URL
		window.addEventListener("hashchange", function(e) {
			history.replaceState({"meeko-decor": true }, null);
		}, true);
		// NOTE fortuitously all the browsers that support pushState() also support addEventListener() and dispatchEvent()
		window.addEventListener("click", decor.onClick, true);
		window.addEventListener("popstate", decor.onPopState, true);
	}
		
	]);
},

onClick: function(e) { // NOTE only pushState enabled browsers use this
	// Before panning to the next page, have to work out if that is appropriate
	if (e["meeko-decor"]) return; // a fake event
	if (e.button != 0) return; // FIXME what is the value for button in IE's W3C events model??
	if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return; // FIXME do these always trigger modified click behavior??
	// Find closest <a> to e.target
	for (var target=e.target; target!=document.body; target=target.parentNode) if (tagName(target) == "a") break;
	if (tagName(target) != "a") return; // only handling hyperlink clicks
	var href = target.getAttribute("href");
	if (!href) return;

	// stop the real click event propagating... FIXME is there a way to detect defaultPrevented without faking events??
	if (e.stopImmediatePropagation) e.stopImmediatePropagation();
	else e.stopPropagation();

	// and dispatch a fake click event
	var fakeEvent = document.createEvent("MouseEvent");
	fakeEvent.initMouseEvent("click", e.bubbles, e.cancelable, e.view, e.detail,
			e.screenX, e.screenY, e.clientX, e.clientY,
			e.ctrlKey, e.altKey, e.shiftKey, e.metaKey,
			e.button, e.relatedTarget);
	fakeEvent["meeko-decor"] = true;
	
	// NOTE the fake event MUST have the default prevented, so provide a way to discover if another script requested it
	var defaultPrevented = false; 
	function preventDefault(event) { if (event.defaultPrevented) defaultPrevented = true; event.preventDefault(); }
	fakeEvent._stopPropagation = fakeEvent.stopPropagation;
	fakeEvent.stopPropagation = function() { preventDefault(this); this._stopPropagation(); }
	fakeEvent._stopImmediatePropagation = fakeEvent.stopImmediatePropagation;
	fakeEvent.stopImmediatePropagation = function() { preventDefault(this); this._stopImmediatePropagation(); }
	window.addEventListener("click", preventDefault, false);
	e.target.dispatchEvent(fakeEvent); 
	window.removeEventListener("click", preventDefault, false);
	
	if (defaultPrevented) { // other scripts want to disable HTMLDecor. FIXME is this a good idea?
		e.preventDefault();
		return;
	}
	
	var acceptDefault = decor.onHyperlink(target);
	if (acceptDefault == false) e.preventDefault();
},

onHyperlink: function(target) { // return false to preventDefault
	if (target.target) return;
	var baseURI = URI(document.URL);
	var uri = URI(baseURI.resolve(target.getAttribute("href")));
	if (uri.nopathname != baseURI.nopathname) return; // and external urls
	
	// by this point HTMLDecor wants to prevent the browser default
	// TODO Need to handle anchor links. The following just replicates browser behavior
	if (uri.nohash == baseURI.nohash) {
		history.pushState({"meeko-decor": true}, null, uri.href);
		scrollToId(target.hash.substr(1));
		return false;
	}

	return decor.onSiteLink(uri.href); // TODO should this pass an absPath rather than absURL??
},

onSiteLink: function(url) { // return false to preventDefault
	// Now attempt to pan
	decor.navigate(url);
	return false;
},

onPopState: function(e) {
	if (!e.state || !e.state["meeko-decor"]) return;
	if (e.stopImmediatePropagation) e.stopImmediatePropagation();
	else e.stopPropagation();
	// NOTE there is no default-action for popstate
	var newURL = URI(document.URL).nohash;
	if (newURL != decor.contentURL) {
		scrollToId();
		var loader = async(function(cb) {
			decor.options.load(document.URL, cb)
		});
		page(loader);
		decor.contentURL = newURL;
	}
	else {
		scrollToId(location.hash && location.hash.substr(1));
	}
},

onUnload: function(e) {
	pageOut();
},

decorate: async(function(decorURL, callback) {
	var decor = this;
	var doc, complete = false;
	var contentStart, decorEnd;

	if (getDecorMeta()) throw "Cannot decorate a document that has already been decorated";
	Anim.hide();

	queue([

	async(function(cb) {
		decor.load(decorURL, { // FIXME this should use options.load or options.loadDecor
			onComplete: function(result) { doc = result; cb.complete(); },
			onError: function() { logger.error("loadHTML fail for " + url); cb.error(); }
		});
	}),
	async(function(cb) {
		// NOTE don't need to keep track of altDecorURL, since it has a 1-to-1 relationship with decorURL
		// TODO but it would be nice to store more data
		var altDecorURL = getDecorURL(doc, true);
		if (!altDecorURL) return true;
		decor.load(altDecorURL, {
			onComplete: function(result) { doc = result; cb.complete(); },
			onError: function() { logger.error("loadHTML fail for " + url); cb.error(); }
		});
	}),
	function() {
		return wait(function() { return !!document.body; });
	},
	function() {
		page_preprocess(document);
		marker = document.createElement("meta");
		marker.name = "meeko-decor";
		document.head.insertBefore(marker, document.head.firstChild);
	},
	
	/* Now merge decor into page */
	function() {
		mergeHead(doc, true);
	},
	function() { return wait(function() { return scriptQueue.isEmpty(); }); }, 
	function() {
		Anim.unhide(); // can unhide page now that decor declared stylesheets have been added
		contentStart = document.body.firstChild;
		decor_insertBody(doc);
		decorEnd = document.createTextNode("");
		document.body.insertBefore(decorEnd, contentStart);
		notify("before", "pageIn", document); // TODO perhaps this should be stalled until scriptQueue.isEmpty() (or a config option)
	},
	function() {
		return until(
			domContentLoaded,
			function() {
				var nodeList = [];
				contentStart = decorEnd.nextSibling;
				if (contentStart) placeContent(
					contentStart,
					function(node, target) {
						decor.placeHolders[target.id] = target;
						notify("before", "nodeInserted", document.body, node);
					},
					function(node) {
						nodeList.push(node.id);
						delay(function() {
							notify("after", "nodeInserted", document.body, node);
							remove(nodeList, node.id);
							if (!nodeList.length) complete = true;
						});
					}
				);
			}
		);
	},
	function() { return wait(function() { return complete && scriptQueue.isEmpty(); }); },
	function() { // NOTE resolve URIs in landing page
		// TODO could be merged with code in parseHTML
		var baseURI = URI(document.URL);
		function resolve(el, attrName) {
			var relURL = el.getAttribute(attrName);
			if (relURL == null) return;
			var mod = relURL.charAt(0);
			var absURL = baseURI.resolve(relURL);
			el.setAttribute(attrName, absURL);
		}
		
		function resolveAll(root, tag, attr) {
			forEach($$(tag, root), function(el) { resolve(el, attr); });
		}
		
		function resolveTree(root, inHead) {
			var tag = tagName(root);
			if (tag in hrefAttrs) resolve(root, hrefAttrs[tag]);
			if (tag in srcAttrs) resolve(root, srcAttrs[tag]);
			if (inHead) return;
			each(hrefAttrs, function(tag, attr) { resolveAll(root, tag, attr); });
			each(srcAttrs, function(tag, attr) { resolveAll(root, tag, attr); });
		}
		
		forSiblings("after", getDecorMeta(), function(node) {
			resolveTree(node, true);
		});
		forEach(decor.placeHolders, function(node) {
			var tree = $(node.id);
			resolveTree(tree, false);
		});
	},
	function() {
		notify("after", "pageIn", document);
		scrollToId(location.hash && location.hash.substr(1));
	}

	], callback);
}),

load: async(function(url, callback) {
	DOM.loadHTML(url, callback);
}),

navigate: async(function(config, callback) {
	var decor = this, url;
	var options = extend({}, decor.options);
	if (typeof config == "object") {
		extend(options, config);
		if (config.pager) setPaging(config.pager);
		url = options.url;
	}
	else url = config;
	var loader = async(function(cb) {
		options.load(url, cb);
	});
	
	page(loader, {
		
	onComplete: function(msg) {
		resetPaging();
		decor.contentURL = URI(document.URL).nohash;
		callback.complete(msg);
	},
	
	onError: function(msg) {
		/*
		  Ideally we just use
		      location.reload()
		  but Webkit / Chrome and Opera have buggy behavior, see https://bugs.webkit.org/show_bug.cgi?id=80697
		  Basically, if `location.replace(url)` is the equivalent of `location.reload()` then
		  back-button behavior is broken on the next-page.
		  Webkit / Chrome would be fixed by
		      history.replaceState({}, null, "#");
		      location.replace("");
		  but Opera needs something more.
		  The following solution works on all browsers tested.
		*/
		history.replaceState({}, null, decor.contentURL);
		removeEvent(window, "unload", decor.onUnload);
		addEvent(window, "unload", noop); // Disable bfcache
		location.replace(url);
		callback.error(msg);
	}
	
	});
	
	// Change document.URL
	// This happens after the page load has initiated and after the pageOut.before handler
	// TODO 
	var modifier = options.replace ? "replaceState" : "pushState";
	history[modifier]({"meeko-decor": true }, null, url);	
}),

options: {
	load: async(function(url, cb) { DOM.loadHTML(url, cb); }),
	replace: false
}

});

/*
 Paging handlers are either a function, or an object with `before` and / or `after` listeners. 
 This means that before and after listeners are registered as a pair, which is desirable.
 FIXME pageOut and pageIn handlers should receive oldURL, newURL
*/
var pager = decor.pager = {};
var paging = pager.options = {
	duration: 0,
	nodeRemoved: { before: hide, after: show },
	nodeInserted: { before: hide, after: show },
	pageOut: { before: noop, after: noop },
	pageIn: { before: noop, after: noop }
}
decor.configurePaging = function(conf) {
	extend(paging, conf); // TODO option checking
}
function setPaging(config) {
	pager.defaultOptions = extend({}, paging);
	extend(paging, config);
}
function resetPaging() {
	if (pager.defaultOptions) {
		paging = pager.defaultOptions;
		delete pager.defaultOptions;
	}
}


function hide(node) { node.setAttribute("hidden", "hidden"); }
function show(node) { node.removeAttribute("hidden"); }
function noop() {}

var notify = function(phase, type, target, detail) {
	var handler = paging[type];
	if (!handler) return;
	if ((type == "nodeRemoved" || type == "nodeInserted") && target != document.body) return; // ignoring mutations in head
	var listener;
	if (handler[phase]) listener = handler[phase];
	else listener =
		(type == "nodeRemoved" || type == "pageOut") ?
			(phase == "before") ? handler : null :
			(phase == "after") ? handler : null;
	if (typeof listener == "function") isolate(function() { listener(detail); }); // TODO isFunction(listener)
}

var page = async(function(loader, callback) {
	var doc, ready = false;

	var outCB = pageOut();
	delay(function() { ready = true; }, paging.duration);

	queue([

	async(function(cb) {
		if (typeof loader == "function") loader({
			onComplete: function(result) { doc = result; if (!outCB.called) outCB.abort(); cb.complete(); },
			onError: function() { logger.error("loadHTML fail for " + url); cb.error(); }		
		});
		else {
			doc = loader;
			return true;
		}
	}),
	function() { return wait(function() { return ready; }); },
	function() {
		if (getDecorURL(document) == getDecorURL(doc)) scrollToId();
		else throw "Next page has different decor"; 
	},
	// we don't get to here if location.replace() was called
	function() {
		return pageIn(doc);
	}
	
	], callback);	
});

var pageOut = async(function(cb) {
	if (!getDecorMeta()) throw "Cannot page if the document has not been decorated";

	notify("before", "pageOut", document);

	each(decor.placeHolders, function(id, node) {
		var target = $id(id);
		notify("before", "nodeRemoved", document.body, target);
	});

	delay(function() { // NOTE external context can abort this delayed call with cb.abort();
		each(decor.placeHolders, function(id, node) {
			var target = $id(id);
			replaceNode(target, node);
			notify("after", "nodeRemoved", document.body, target);
		});
		notify("after", "pageOut", document);
	}, paging.duration, cb);
});

var pageIn = async(function(doc, cb) {
	
	queue([

	function() {
		notify("before", "pageIn", document, doc);
		page_preprocess(doc);
	},
	function() {
		mergeHead(doc, false);
	},
	async(function(cb) {
		var nodeList = [];
		var contentStart = doc.body.firstChild;
		if (contentStart) placeContent(contentStart,
			function(node) { notify("before", "nodeInserted", document.body, node); },
			function(node) {
				nodeList.push(node);
				delay(function() {
					notify("after", "nodeInserted", document.body, node);
					remove(nodeList, node);
					if (!nodeList.length) cb.complete();
				});
			}
		);
	}),
	function() { return wait(function() { return scriptQueue.isEmpty(); }); },
	function() {
		scrollToId(location.hash && location.hash.substr(1));
		notify("after", "pageIn", document);
	}

	], cb);
});


function mergeHead(doc, isDecor) {
	var baseURI = URI(document.URL);
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
				return baseURI.resolve(el.src) != node.src; // FIXME @src should already be resolved to absURL
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
		if (tagName(srcNode) == "link") srcNode.href = srcNode.getAttribute("href"); // Otherwise <link title="..." /> stylesheets don't work on Chrome
	});
	// allow scripts to run
	forEach($$("script", dstHead), function(script) { scriptQueue.push(script); }); // FIXME this breaks if a script inserts other scripts
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

function placeContent(content, beforeReplace, afterReplace) { // this should work for content from both internal and external documents
	var srcBody = content.parentNode;
	forSiblings ("starting", content, function(node) { 
		var target;
		if (node.id && (target = $id(node.id)) != node) {
			// TODO compat check between node and target
			if (beforeReplace) beforeReplace(node, target);
			try { replaceNode(target, node); } // NOTE fails in IE <= 8 if node is still loading
			catch (error) { return; }
			if (afterReplace) afterReplace(node, target);
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
		if ("script" === tagName(node)) scriptQueue.push(node);
		else forEach($$("script", node), function(script) { scriptQueue.push(script); });
	});
}

var scriptQueue = new function() {
	
var queue = [], pending = false, blockingScript, onClose;

var queueScript = function(script, node) {
	queue.push({ script: script, node: node });
	if (blockingScript) return;
	processQueue();
}

var processQueue = function() {
	if (pending) return;
	delay(_processQueue);
	pending = true;
}

var _processQueue = function() {
	pending = false;
	blockingScript = null;
	while (!blockingScript && queue.length > 0) {
		var spec = queue.shift(), script = spec.script, node = spec.node;
		if (script.src && !script.getAttribute("async")) {
			blockingScript = spec;
			addEvent(script, "load", processQueue);
			addEvent(script, "error", processQueue);
		}
		replaceNode(node, script);
	}
}

this.push = function(node) {
	if (!/^text\/javascript\?disabled$/i.test(node.type)) return;
	var script = document.createElement("script");
	copyAttributes(script, node);
	script.type = "text/javascript";
	
	// FIXME is this comprehensive?
	try { script.innerHTML = node.innerHTML; }
	catch (error) { script.text = node.text; }
	
	queueScript(script, node);
}

this.isEmpty = function() {
	return (queue.length <= 0 && !blockingScript);
}

}

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

function getDecorURL(doc, inDecor) {
	var link = getDecorLink(doc, inDecor);
	if (!link) return null; // FIXME warning message
	var href = link.getAttribute("href");
	if (inDecor) return href;
	return URI(document.URL).resolve(href); // FIXME href should already be absolute
}

function getDecorLink(doc, inDecor) {
	if (!doc) doc = document;
	var frameTheme, userTheme;
	if (window.frameElement) frameTheme = window.frameElement.getAttribute("data-theme");
	// FIXME should userTheme come from the config??
	userTheme = decor["theme"]; 
	var matchingLinks = [];
	var link, specificity = 0;
	forEach($$("link", doc.head), function(el) {
		var tmp, sp = 0;
		if (el.nodeType != 1) return;
		var type = lc(el.type);
		if (inDecor) {
			if (!/^\s*ALTERNATE\s*$/i.test(el.rel)) return;
			if (type == "text/html" || type == "") sp += 1;
			else return;
		}
		else {
			if (!/^\s*MEEKO-DECOR\s*$/i.test(el.rel)) return;
			if (type == "text/html" || type == "") sp += 1;
			else {
				logger.error("Invalid decor document type: " + type);
				return;
			}
		}
		// TODO @data-assert="<js-code>"
		if (tmp = el.getAttribute("media")) { // FIXME polyfill for matchMedia??
			if (window.matchMedia && window.matchMedia(tmp).matches) sp += 4;
			else return; // NOTE if the platform doesn't support media queries then this decor is rejected
		}
		if (tmp = el.getAttribute("data-frame-theme")) {
			if (tmp == frameTheme) sp += 8;
			else return;
		}
		if (tmp = el.getAttribute("data-user-theme")) {
			if (tmp == userTheme) sp += 16;
			else return;
		}
		if (sp > specificity) {
			specificity = sp;
			link = el;
		}
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
	var timeout = decor["hidden-timeout"];
	if (timeout <= 0) return;
	document.head.insertBefore(style, document.head.firstChild);
	hidden = true;
	unhiding = false;
	delay(_unhide, timeout);
}
function unhide() {
	if (unhiding) return;
	unhiding = true;
	return queue([
		function() { return wait(function() { return checkStyleSheets(); }) },
		_unhide
	]);
}

function _unhide() {
	if (!hidden) return;
	hidden = false;
	document.head.removeChild(style);
	// NOTE on IE sometimes content stays hidden although 
	// the stylesheet has been removed.
	// The following forces the content to be revealed
	document.body.style.visibility = "hidden";
	delay(function() { document.body.style.visibility = ""; }, config["polling-interval"]);
}

/* 
NOTE:  for more details on how checkStyleSheets() works cross-browser see 
http://aaronheckmann.blogspot.com/2010/01/writing-jquery-plugin-manager-part-1.html
TODO: does this still work when there are errors loading stylesheets??
*/
var checkStyleSheets = decor.checkStyleSheets = function() {
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

}); // end decor defn

decor["theme"] = config["decor-theme"];
decor["hidden-timeout"] = config["decor-hidden-timeout"];
if (config["decor-autostart"]) decor.start();

})();

