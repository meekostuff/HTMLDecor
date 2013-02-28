/*!
 * Copyright 2009-2013 Sean Hogan (http://meekostuff.net/)
 * Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
 */

// TODO Move script and options detection outside of the decor module
// Eventually logger and decor could be in separate modules
// and built into this script.

// TODO substantial error handling and notification needs to be added
// Also more isolation.
// <link rel="self" />
// Would be nice if more of the internal functions were called as method, eg DOM.isContentLoaded()...
// ... this would allow the boot-script to modify them as appropriate

// FIXME Is javascript even supported for different media devices? 
// e.g. will <link rel="meeko-decor" media="print" /> even work?

// FIXME for IE7, IE8 sometimes XMLHttpRequest is in a detectable but not callable state
// This is usually fixed by refreshing, or by the following work-around.
// OTOH, maybe my IE installation is bad
var XMLHttpRequest = window.XMLHttpRequest; 

(function() {

var defaults = { // NOTE defaults also define the type of the associated config option
	"log_level": "warn",
	"polling_interval": 50
}

var vendorPrefix = "meeko";

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
	each(src, function(key, val) { if (dest[key] == null) dest[key] = val; });
	return dest;
}

var config = function(dest, src) {
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
	this.isAsync = true;
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

function isAsync(obj) {
	return (obj && obj.isAsync);
}

var async = function(fn) {
	var wrapper = function() {
		var nParams = fn.length, nArgs = arguments.length;
		if (nArgs > nParams) throw "Too many parameters in async call";
		var inCB = arguments[nParams - 1], cb;
		if (isAsync(inCB)) cb = inCB;
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
		var result = fn.apply(this, params); // FIXME result should never occur, right? Is it an async function or not!?
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
		window.clearInterval(timerId); // FIXME probably shouldn't use intervals cause it may screw up debuggers
		timerId = null;
	}
}

var wait = async(function(fn, waitCB) {
	waitCB.hook = fn;
	callbacks.push(waitCB);
	if (!timerId) timerId = window.setInterval(waitback, async.pollingInterval); // NOTE polling-interval is configured below
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
		var success = isolate(function() { result = fn(); });
		if (!success) {
			delayCB.error();
			return;
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
			if (isAsync(innerCB)) {
				innerCB.onComplete = queueback;
				innerCB.onError = function() { queueCB.error(); }
				return;
			}
		}
		queueCB.complete();
	}
	queueCB.onAbort = function() {
		if (isAsync(innerCB)) innerCB.abort();
		list = [];
	}
	queueback();
});

async.pollingInterval = defaults['polling_interval'];

extend(async, {
	isAsync: isAsync, Callback: Callback, delay: delay, wait: wait, until: until, queue: queue
});
Meeko.async = async;

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

var composeNode = function(srcNode) { // document.importNode() NOT available on IE < 9
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

var readyStateLookup = {
	"uninitialized": false,
	"loading": false,
	"interactive": false, // TODO is this correct??
	"loaded": true,
	"complete": true
}

var isContentLoaded = function() { // WARN this assumes that document.readyState is valid or that content is ready...
	// Change Meeko.DOM.isContentLoaded if you need something better
	var readyState = document.readyState;
	var loaded = !readyState || readyStateLookup[readyState];
	return loaded;
}

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
	this.toString = function() { return this.href; }
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

var parseHTML = function(html, url) {
	parser = new HTMLParser();
	return parser.parse(html, url);
}

var HTMLParser = (function() {
// This class allows external code to provide a `prepare(doc)` method for before content parsing.
// The main reason to do this is the so called `html5shiv`. 

var HTMLParser = function() {}

extend(HTMLParser.prototype, {

parse: function(html, url) {
	if (!url) throw "URL must be specified";
	var parser = this;
	
	// TODO disabling URIs would be faster if done with one regexp replace()
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

	if (parser.prepare) isolate(function() { parser.prepare(iframeDoc) }); // WARN external code
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


}); // end HTMLParser prototype


// TODO should these functions be exposed on `DOM`?
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
	
	var doc = createDocument();
	doc.appendChild(docEl);
	polyfill(doc);

	/*
	 * WARN on IE6 `element.innerHTML = ...` will drop all leading <script>'s
	 * Work-around this by prepending some benign element to the src <body>
	 * and removing it from the dest <body> after the copy is done
	 */
	var srcBody = srcDoc.body;
	// FIXME why can't we just use srcBody.cloneNode(true)??
	if (HTMLParser.prototype.prepare) HTMLParser.prototype.prepare(doc); // TODO maybe this should be in createDocument
	srcBody.insertBefore(srcDoc.createElement('wbr'), srcBody.firstChild);
	docBody.innerHTML = srcDoc.body.innerHTML; 

	docBody.removeChild(docBody.firstChild); // TODO assert firstChild.tagName == 'wbr'

	return doc;
}

// FIXME should be called importSingleNode or something
var importNode = document.importNode ? // NOTE only for single nodes, especially elements in <head>. 
function(srcNode) { 
	return document.importNode(srcNode, false);
} :
composeNode; 


return HTMLParser;

})();


/* 
NOTE:  for more details on how checkStyleSheets() works cross-browser see 
http://aaronheckmann.blogspot.com/2010/01/writing-jquery-plugin-manager-part-1.html
TODO: does this still work when there are errors loading stylesheets??
*/
var checkStyleSheets = function() {
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

var polyfill = function(doc) { // NOTE more stuff could be added here if *necessary*
	if (!doc) doc = document;
	if (!doc.head) doc.head = firstChild(doc.documentElement, "head");
}

var DOM = Meeko.DOM || (Meeko.DOM = {});
extend(DOM, {
	$id: $id, $$: $$, tagName: tagName, forSiblings: forSiblings, matchesElement: matchesElement, firstChild: firstChild,
	replaceNode: replaceNode, scrollToId: scrollToId, addEvent: addEvent, removeEvent: removeEvent, createDocument: createDocument,
	isContentLoaded: isContentLoaded, URI: URI, HTMLParser: HTMLParser, loadHTML: loadHTML, parseHTML: parseHTML, copyAttributes: copyAttributes,
	polyfill: polyfill
});


polyfill();

var logger = Meeko.logger || (Meeko.logger = new function() {

var levels = this.levels = words("none error warn info debug");

forEach(levels, function(name, num) {
	
levels[name] = num;
this[name] = !window.console && function() {} ||
	console[name] && function() { if (num <= this.LOG_LEVEL) console[name].apply(console, arguments); } ||
	function() { if (num <= this.LOG_LEVEL) console.log.apply(console, arguments); }

}, this);

this.LOG_LEVEL = levels[defaults['log_level']]; // DEFAULT

}); // end logger defn


var decor = Meeko.decor = {};
decor.config = function(options) {
	config(this.options, options);
}

var panner = Meeko.panner = {};
panner.config = decor.config;

extend(decor, {

started: false,
current: {
	url: null
},
placeHolders: {},

start: function() {
	if (decor.started) throw "Already started";
	decor.started = true;
	var options = decor.options, lookup = options.lookup, detect = options.detect;
	var decorURL;
	var uri = URI(document.URL);
	if (lookup) decorURL = lookup(uri);
	if (!decorURL && detect) decorURL = detect(document); // FIXME this should wait until <head> is completely loaded
	if (!decorURL) return; // FIXME warning message + notify decorAbort
	decorURL = uri.resolve(decorURL);
	decor.current.url = decorURL; // FIXME what if decorate fails??
	return queue([

	function() {
		return decor.decorate(decorURL);
	},
	function() {
		panner.contentURL = URI(document.URL).nohash;
		addEvent(window, "unload", panner.onUnload);
		
		if (!history.pushState) return;
		
		history.replaceState({"meeko-decor": true }, null); // otherwise there will be no popstate when returning to original URL
		window.addEventListener("hashchange", function(e) {
			history.replaceState({"meeko-decor": true }, null);
		}, true);
		// NOTE fortuitously all the browsers that support pushState() also support addEventListener() and dispatchEvent()
		window.addEventListener("click", function(e) { panner.onClick(e); }, true);
		window.addEventListener("popstate", function(e) { panner.onPopState(e); }, true);
	}
		
	]);
},

decorate: async(function(decorURL, callback) {
	var doc, complete = false;
	var contentStart, decorEnd;
	var decorReady = false;

	if (getDecorMeta()) throw "Cannot decorate a document that has already been decorated";

	queue([

	async(function(cb) {
		var load = decor.options.httpGet;
		load(decorURL, null, {}, {
			onComplete: function(result) {
				var normalize = decor.options.normalize;
				if (normalize) isolate(function() { normalize(result, { uri: URI(decorURL) }); });
				doc = result;
				cb.complete(doc);
			},
			onError: function() { logger.error("loadHTML fail for " + decorURL); cb.error(); } // FIXME need decorError notification / handling
		});
	}),
	function() {
		if (panner.options.normalize) return wait(function() { return DOM.isContentLoaded(); });
		else return wait(function() { return !!document.body; });
	},
	function() {
		var normalize = panner.options.normalize;
		if (normalize) isolate(function() { normalize(document, { uri: URI(document.URL) }); });
		page_prepare(document);
		marker = document.createElement("meta");
		marker.name = "meeko-decor";
		document.head.insertBefore(marker, document.head.firstChild);
	},
	
	/* Now merge decor into page */
	function() {
		decor_notify("before", "decorIn", document);
		mergeHead(doc, true);
	},
	function() { return wait(function() { return scriptQueue.isEmpty(); }); }, 
	function() {
		contentStart = document.body.firstChild;
		decor_insertBody(doc);
		decor_notify("after", "decorIn", document);
		wait(function() { return checkStyleSheets(); }, function() { decorReady = true; decor_notify("after", "decorReady", document); });
		decorEnd = document.createTextNode("");
		document.body.insertBefore(decorEnd, contentStart);
		notify("before", "pageIn", document); // TODO perhaps this should be stalled until scriptQueue.isEmpty() (or a config option)
	},
	function() {
		return until(
			function() { return DOM.isContentLoaded(); },
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
		function _resolve(el, attrName) {
			var relURL = el.getAttribute(attrName);
			if (relURL == null) return;
			var absURL = baseURI.resolve(relURL);
			el.setAttribute(attrName, absURL);
		}
		
		function resolve(el, attrName) {
			if (tagName(el) != 'script') return _resolve(el, attrName);		
			var scriptType = el.type;
			var isJS = (!scriptType || /^text\/javascript/i.test(scriptType));
			if (isJS) el.type = "text/javascript?complete"; // IE6 and IE7 will re-execute script if @src is modified (even to same path)
			_resolve(el, attrName);
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
	},
	function() { return wait(function() { return decorReady; }); }

	], callback);
})

});


extend(panner, {

contentURL: "",

onClick: function(e) {
	// NOTE only pushState enabled browsers use this
	// We want panning to be the default behavior for clicks on hyperlinks - <a href>
	// Before panning to the next page, have to work out if that is appropriate
	// `return` means ignore the click

	if (e.button != 0) return; // FIXME what is the value for button in IE's W3C events model??
	if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return; // FIXME do these always trigger modified click behavior??

	// Find closest <a> to e.target
	for (var target=e.target; target!=document.body; target=target.parentNode) if (tagName(target) == "a") break;
	if (tagName(target) != "a") return; // only handling hyperlink clicks
	var href = target.getAttribute("href");
	if (!href) return; // not really a hyperlink
	
	// test hyperlinks
	if (target.target) return; // no iframe
	var baseURI = URI(document.URL);
	var uri = URI(baseURI.resolve(href));
	if (uri.nopathname != baseURI.nopathname) return; // no external urls
	
	// TODO perhaps should test same-site and same-page links
	var isPageLink = (uri.nohash == baseURI.nohash); // TODO what about page-links that match the current hash
	
	// From here on we effectively take over the default-action of the event
	// Shim the event to detect if external code has called preventDefault(), and to make sure we call it (but late as possible);
	var defaultPrevented = false;
	e._preventDefault = e.preventDefault;
	e.preventDefault = function(event) { defaultPrevented = true; this._preventDefault(); }
	e._stopPropagation = e.stopPropagation;
	e.stopPropagation = function() { this._preventDefault(); this._stopPropagation(); }
	if (e.stopImmediatePropagation) {
		e._stopImmediatePropagation = e.stopImmediatePropagation;
		e.stopImmediatePropagation = function() { this._preventDefault(); this._stopImmediatePropagation(); }
	}
	
	function backstop(event) { event._preventDefault(); }
	window.addEventListener('click', backstop, false);
	
	delay(function() {
		window.removeEventListener('click', backstop, false);
		if (defaultPrevented) return;
		if (isPageLink) panner.onPageLink(uri);
		else panner.onSiteLink(uri);
	});
},

onPageLink: function(uri) {	// TODO Need to handle anchor links. The following just replicates browser behavior
	history.pushState({"meeko-decor": true}, null, uri.href);
	scrollToId(uri.hash.substr(1));
},

onSiteLink: function(uri) {	// Now attempt to pan
	panner.assign(uri.href);
},

onPopState: function(e) {
	if (!e.state || !e.state["meeko-decor"]) return;
	if (e.stopImmediatePropagation) e.stopImmediatePropagation();
	else e.stopPropagation();
	// NOTE there is no default-action for popstate
	var newURL = URI(document.URL).nohash;
	if (newURL != panner.contentURL) {
		scrollToId();
		var loader = async(function(cb) {
			var load = panner.options.httpGet;
			load(document.URL, null, {}, {
				onComplete: function(doc) {
					var normalize = panner.options.normalize;
					if (normalize) isolate(function() { normalize(doc, { uri: URI(document.URL) }); });
					cb.complete(doc);
				},
				onError: function(err) { cb.error(err); }
			});
		});
		page(loader);
		panner.contentURL = newURL;
	}
	else {
		scrollToId(location.hash && location.hash.substr(1));
	}
},

onUnload: function(e) {
	pageOut();
},

assign: function(url, callback) {
	panner.navigate({
		url: url,
		replace: false
	}, callback);
},

replace: function(url, callback) {
	panner.navigate({
		url: url,
		replace: true
	}, callback);
},

navigate: async(function(options, callback) {
	var url = options.url;
	var uri = URI(url);
	var decorURL = decor.options.lookup(uri);
	if (typeof decorURL !== "string" || URI(document.URL).resolve(decorURL) !== decor.current.url) {
		removeEvent(window, "unload", panner.onUnload);
		addEvent(window, "unload", noop); // Disable bfcache
		var modifier = options.replace ? "replace" : "assign";
		location[modifier](url);
		callback.complete(msg);	// TODO should this be an error??
		return;
	}

	var loader = async(function(cb) {
		var load = panner.options.httpGet;
		load(url, null, {}, {
			onComplete: function(doc) {
				var normalize = panner.options.normalize;
				if (normalize) isolate(function() { normalize(doc, { uri: URI(url) }); }); // FIXME what if normalize throws??
				cb.complete(doc);
			},
			onError: function(err) { cb.error(err); }
		});
	})

	page(loader, {
		
	onComplete: function(msg) {
		panner.contentURL = URI(document.URL).nohash;
		callback.complete(msg);
	}
	
	});
	
	// Change document.URL
	// This happens after the page load has initiated and after the pageOut.before handler
	// TODO
	var modifier = options.replace ? "replaceState" : "pushState";
	history[modifier]({"meeko-decor": true }, null, url);	
})

});

/*
 Paging handlers are either a function, or an object with `before` and / or `after` listeners. 
 This means that before and after listeners are registered as a pair, which is desirable.
 FIXME pageOut and pageIn handlers should receive oldURL, newURL
*/
function hide(node) { node.setAttribute("hidden", "hidden"); }
function show(node) { node.removeAttribute("hidden"); }
function noop() {}

decor.options = {
	lookup: function(uri) {},
	detect: function(document) {},
	httpGet: async(function(uri, data, settings, cb) { DOM.loadHTML(uri, cb); }),
	// load: async(function(uri, data, settings, cb) {}),
	decorIn: { before: noop, after: noop },
	decorReady: noop, // TODO should this be decorIn:complete ??
	decorOut: { before: noop, after: noop } // TODO
}

panner.options = { 
	duration: 0,
	httpGet: async(function(uri, data, settings, cb) { DOM.loadHTML(uri, cb); }),
	// httpPost: async(function(uri, data, settings, cb) {}),
	// load: async(function(uri, data, settings, cb) {}),
	// normalize: function(doc, settings) {},
	nodeRemoved: { before: hide, after: show },
	nodeInserted: { before: hide, after: show },
	pageOut: { before: noop, after: noop },
	pageIn: { before: noop, after: noop },
}

var decor_notify = function(phase, type, target, detail) {
	var handler = decor.options[type];
	if (!handler) return;
	var listener;
	if (handler[phase]) listener = handler[phase];
	else listener =
		(type == "decorOut") ?
			(phase == "before") ? handler : null :
			(phase == "after") ? handler : null;
	if (typeof listener == "function") isolate(function() { listener(detail); }); // TODO isFunction(listener)
}

var notify = function(phase, type, target, detail) {
	var handler = panner.options[type];
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
	delay(function() { ready = true; }, panner.options.duration);

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
		scrollToId();
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
	}, panner.options.duration, cb);
});

var pageIn = async(function(doc, cb) {
	
	queue([

	function() {
		notify("before", "pageIn", document, doc);
		page_prepare(doc);
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
		if (tagName(node) == "script" && (!node.type || node.type.match(/^text\/javascript/i))) return;
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
			if (/^\s*viewport\s*$/i.test(srcNode.name)) srcNode = composeNode(srcNode); // TODO Opera mobile was crashing. Is there another way to fix this?
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

function page_prepare(doc) {
	var srcHead = doc.head;
	forSiblings ("starting", srcHead.firstChild, function(node) { // remove nodes that match specified conditions
		switch(tagName(node)) { 
		case "style": case "link":
			if (node.title.match(/^\s*nodecor\s*$/i)) break;
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
			addEvent(script, "load", processQueue); // FIXME need onreadystatechange in IE
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

function getDecorMeta(doc) {
	if (!doc) doc = document;
	var meta = firstChild(doc.head, function(el) {
		return el.nodeType == 1 &&
			tagName(el) == "meta" &&
			/\bMEEKO-DECOR\b/i.test(el.name);
	});
	return meta;
}

// end decor defn

})();

