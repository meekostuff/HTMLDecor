/*!
 * Copyright 2009-2013 Sean Hogan (http://meekostuff.net/)
 * Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
 */

/* TODO
    + substantial error handling and notification needs to be added
    + more isolation
    + <link rel="self" />
    + Would be nice if more of the internal functions were called as method, eg DOM.isContentLoaded()...
        this would allow the boot-script to modify them as appropriate
    + Up-front feature testing to prevent boot on unsupportable platorms...
        e.g. can't create HTML documents
 */

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
var forEach = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) fn.call(context, a[i], i, a); }

var every = function(a, fn, context) { 
	for (var n=a.length, i=0; i<n; i++) {
		if (!fn.call(context, a[i], i, a)) return false; 
	}
	return true;
}

var words = function(text) { return text.split(/\s+/); }

var each = (Object.keys) ? // TODO is this feature detection worth-while?
function(object, fn, context) {
	forEach(Object.keys(object), function(key) { fn.call(context, key, object[key], object); });
} : 
function(object, fn, context) { // WARN won't work on native objects in old IE
	for (slot in object) {
		if (object.hasOwnProperty && object.hasOwnProperty(slot)) fn.call(context, slot, object[slot], object);
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

if (!Meeko.stuff) Meeko.stuff = {}
extend(Meeko.stuff, {
	uc: uc, lc: lc, forEach: forEach, every: every, words: words, each: each, extend: extend, config: config, trim: trim
});

/*
 ### Task queuing and isolation
 */

var queueTask = window.setImmediate || (function() {

var taskQueue = [];
var scheduled = false;

function queueTask(fn) {
	taskQueue.push(fn);
	if (scheduled) return;
	schedule(processTasks);
	scheduled = true;
}

// NOTE schedule used to be approx: setImmediate || postMessage || setTimeout
var schedule = window.setTimeout;

function processTasks() {
	var task;
	while (taskQueue.length) {
		task = taskQueue.shift();
		if (typeof task !== 'function') continue;
		var success = isolate(task);
		// FIXME then what??
	}
	scheduled = false;
}

return queueTask;

})();

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
		var e = document.createEvent("Event");
		e.initEvent(evType, true, true);
		window.dispatchEvent(e);
		return complete.pop();
	}
}
else if ("onpropertychange" in document) { // TODO this is for IE <= 8. Might be better with the re-throw solution
	var meta = document.createElement("meta");
	meta[evType] = 0;
	meta.onpropertychange = function(e) { e = e || window.event; if (e.propertyName === evType) wrapper() }
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
	catch(error) { setTimeout(function() { throw error; }); }
	return complete;
}

return isolate;
})();


/*
 ### FutureFu - a base-class for Futures
 */

var FutureFu = Meeko.FutureFu = function(init) { // `init` is called as init.call(resolver)
	if (!(this instanceof FutureFu)) return new FutureFu(init);
	
	var future = this;
	future._constructor = FutureFu;
	future._initialize();

	if (init === undefined) return;

	var resolver = future._resolver;
	try { init.call(resolver); }
	catch(error) { future._reject(error); }
	// NOTE future is returned by `new` invocation
}

extend(FutureFu.prototype, {

_initialize: function() {
	var future = this;
	future._acceptCallbacks = [];
	future._rejectCallbacks = [];
	future._accepted = null;
	future._result = null;
	future._processing = false;	
	future._resolver = {
		accept: function(value) { future._accept(value); },
		resolve: function(value) { future._resolve(value); },
		reject: function(value) { future._reject(value); }
	}
},

_accept: function(result, sync) { // NOTE equivalent to "accept algorithm". External calls MUST NOT use sync
	var future = this;
	if (future._accepted != null) return;
	future._accepted = true;
	future._result = result;
	future._requestProcessing(sync);
},

_resolve: function(value, sync) { // NOTE equivalent to "resolve algorithm". External calls MUST NOT use sync
	var future = this;
	if (future._accepted != null) return;
	if (value != null && typeof value.then === 'function') {
		try {
			value.then(
				function(result) { future._resolve(result); },
				function(error) { future._reject(error); }
			);
		}
		catch(error) {
			future._reject(error, sync);
		}
		return;
	}
	// else
	future._accept(value, sync);
},

_reject: function(error, sync) { // NOTE equivalent to "reject algorithm". External calls MUST NOT use sync
	var future = this;
	if (future._accepted != null) return;
	future._accepted = false;
	future._result = error;
	future._requestProcessing(sync);
},

_requestProcessing: function(sync) { // NOTE schedule callback processing. TODO may want to disable sync option
	var future = this;
	if (future._accepted == null) return;
	if (future._processing) return;
	if (sync) {
		future._processing = true;
		future._process();
		future._processing = false;
	}
	else {
		queueTask(function() {
			future._processing = true;
			future._process();
			future._processing = false;
		});
	}
},

_process: function() { // NOTE process a futures callbacks
	var future = this;
	var result = future._result;
	var callbacks, cb;
	if (future._accepted) {
		future._rejectCallbacks.length = 0;
		callbacks = future._acceptCallbacks;
	}
	else {
		future._acceptCallbacks.length = 0;
		callbacks = future._rejectCallbacks;
	}
	while (callbacks.length) {
		cb = callbacks.shift();
		if (typeof cb === 'function') isolate(function() { cb(result); });
	}
},

done: function(acceptCallback, rejectCallback) {
	var future = this;
	future._acceptCallbacks.push(acceptCallback);
	future._rejectCallbacks.push(rejectCallback);
	future._requestProcessing();
},

thenfu: function(acceptCallback, rejectCallback) {
	var future = this;
	var constructor = future._constructor; //  || future.constructor;
	var newResolver, newFuture = new constructor(function() { newResolver = this; });
	var acceptWrapper = acceptCallback ?
		wrapfuCallback(acceptCallback, newResolver, newFuture) :
		function(value) { newFuture._accept(value); }

	var rejectWrapper = rejectCallback ? 
		wrapfuCallback(rejectCallback, newResolver, newFuture) :
		function(error) { newFuture._reject(error); }

	future.done(acceptWrapper, rejectWrapper);
	
	return newFuture;
}

});

/* Functional composition wrapper for `thenfu` */
function wrapfuCallback(callback, resolver, future) {
	return function() {
		try {
			callback.apply(resolver, arguments);
		}
		catch (error) {
			future._reject(error, true);
		}
	}
}


/*
 ### Future
 */

/* If you want to sub-class FutureFu then do it like this:

var Future = Meeko.Future = function(init) { // `init` is called as init.call(resolver)
	if (!(this instanceof Future)) return new Future(init);

	var future = this;
	future._constructor = Future; // FutureFu#pipefu calls `new future._constructor( init )`. 
	future._initialize();

	if (init === undefined) return;

	var resolver = future._resolver;
	try { init.call(resolver); }
	catch(error) { future._reject(error); }
	// NOTE future is returned by `new` invokation
}

var _Future = function() {}
_Future.prototype = FutureFu.prototype;
Future.prototype = new _Future();

*/
/* If you just want to take-over FutureFu then do it this way: */

var Future = Meeko.Future = FutureFu;

/**/

extend(Future.prototype, {
	
then: function(acceptCallback, rejectCallback) {
	var future = this;
	var acceptWrapper = acceptCallback && wrapResolve(acceptCallback);
	var rejectWrapper = rejectCallback && wrapResolve(rejectCallback);
	return future.thenfu(acceptWrapper, rejectWrapper);
},

'catch': function(rejectCallback) { // FIXME 'catch' is unexpected identifier in IE8-
	var future = this;
	return future.then(null, rejectCallback);
}

});

/* Functional composition wrapper for `then` */
function wrapResolve(callback) { // prewrap in .then() before passing to .pipefu() and thence to wrapfu
	return function() {
		var value = callback.apply(null, arguments); 
		this.resolve(value, true);
	}
}


extend(Future, {

resolve: function(value) { // NOTE equivalent to "resolve wrap"
	var resolver, future = new Future(function() { resolver = this; });
	resolver.resolve(value);
	return future;
}

});


/*
 ### Async functions
   wait(test) waits until test() returns true
   delay(timeout, fn) makes one call to fn() after timeout ms
   pipe(startValue, [fn1, fn2, ...]) will call functions sequentially
 */
var wait = (function() {
	
var timerId, tests = [];

function wait(fn) {
	var resolver, future = new Future(function() { resolver = this; });
	tests.push({
		fn: fn,
		resolver: resolver
	});
	if (!timerId) timerId = window.setInterval(poller, Future.pollingInterval); // NOTE polling-interval is configured below		
	return future;
}

function poller() {
	var test, i = 0;
	while ((test = tests[i])) {
		var fn = test.fn, resolver = test.resolver;
		var done;
		try {
			done = fn();
			if (done) {
				tests.splice(i,1);
				resolver.accept(done);
			}
			else i++;
		}
		catch(error) {
			tests.splice(i,1);
			resolver.reject(error);
		}
	}
	if (tests.length <= 0) {
		window.clearInterval(timerId); // FIXME probably shouldn't use intervals cause it may screw up debuggers
		timerId = null;
	}
}

return wait;

})();

function delay(timeout, fn) { // NOTE fn is optional
	var resolver, future = new Future(function() { resolver = this; });
	window.setTimeout(function() {
		var result;
		try {
			result = fn && fn();
			resolver.accept(result);
		}
		catch(error) {
			resolver.reject(error);
		}
	}, timeout);
	return future;
}

function pipe(startValue, fnList) {
	var future = Future.resolve(startValue);
	while (fnList.length) { 
		var fn = fnList.shift();
		future = future.then(fn);
	}
	return future;
}

Future.pollingInterval = defaults['polling_interval'];

extend(Future, {
	isolate: isolate, queue: queueTask, delay: delay, wait: wait, pipe: pipe
});



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

var createDocument = // TODO this doesn't handle old non-IE browsers
document.implementation.createHTMLDocument && function() { // modern browsers
	var doc = document.implementation.createHTMLDocument("");
	doc.removeChild(doc.documentElement);
	return doc;
} ||
document.createDocumentFragment().getElementById && function() { return document.createDocumentFragment(); } || // IE <= 8 
function() { return document.cloneNode(false); }  // old IE

var scrollToId = function(id) {
	if (id) {
		var el = $id(id);
		if (el) el.scrollIntoView(true);
	}
	else window.scroll(0, 0);
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

var domReady = (function() { // WARN this assumes that document.readyState is valid or that content is ready...

var readyState = document.readyState;
var loaded = readyState ? readyStateLookup[readyState] : true;
var queue = [];

function domReady(fn) {
	queue.push(fn);
	if (loaded) processQueue();
}

function processQueue() {
	forEach(queue, setTimeout, window);
	queue.length = 0;
}

if (!loaded) addListeners();

return domReady;

// NOTE the following functions are hoisted
function onLoaded(e) {
	loaded = true;
	removeListeners();
	processQueue();
}

function addListeners() {
	addEvent(document, "DOMContentLoaded", onLoaded);
	addEvent(window, "load", onLoaded);
}

function removeListeners() {
	removeEvent(document, "DOMContentLoaded", onLoaded);
	removeEvent(window, "load", onLoaded);
}

})();


var overrideDefaultAction = function(e, fn) {
	// Shim the event to detect if external code has called preventDefault(), and to make sure we call it (but late as possible);
	e['meeko-panner'] = true;
	var defaultPrevented = false;
	e._preventDefault = e.preventDefault;
	e.preventDefault = function(event) { defaultPrevented = true; this._preventDefault(); } // TODO maybe we can just use defaultPrevented?
	e._stopPropagation = e.stopPropagation;
	e.stopPropagation = function() { // WARNING this will fail to detect event.defaultPrevented if event.preventDefault() is called afterwards
		if (this.defaultPrevented) defaultPrevented = true; // FIXME is defaultPrevented supported on pushState enabled browsers?
		this._preventDefault();
		this._stopPropagation();
	}
	if (e.stopImmediatePropagation) {
		e._stopImmediatePropagation = e.stopImmediatePropagation;
		e.stopImmediatePropagation = function() {
			if (this.defaultPrevented) defaultPrevented = true;
			this._preventDefault();
			this._stopImmediatePropagation();
		}
	}
	
	function backstop(event) {
		if (event.defaultPrevented)  defaultPrevented = true;
		event._preventDefault();
	}
	window.addEventListener(e.type, backstop, false);
	
	delay(0, function() {
		window.removeEventListener(e.type, backstop, false);
		if (defaultPrevented) return;
		fn(e);
	});
}

var URL = (function() {

var URL = function(str) {
	if (!(this instanceof URL)) return new URL(str);
	this.parse(str);
}

var keys = ["source","protocol","hostname","port","pathname","search","hash"];
var parser = /^([^:\/?#]+:)?(?:\/\/([^:\/?#]*)(?::(\d*))?)?([^?#]*)?(\?[^#]*)?(#.*)?$/;

URL.prototype.parse = function parse(str) {
	str = trim(str);
	var	m = parser.exec(str);

	for (var n=keys.length, i=0; i<n; i++) this[keys[i]] = m[i] || '';
	this.protocol = lc(this.protocol);
	this.hostname = lc(this.hostname);
	this.host = this.hostname;
	if (this.port) this.host += ':' + this.port;
	this.supportsResolve = /^(http|https|ftp|file):$/i.test(this.protocol);
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

URL.prototype.resolve = function resolve(relURL) {
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


return URL;

})();

var loadHTML = function(url) { // WARN only performs GET
	var htmlLoader = new HTMLLoader();
	var method = 'get';
	return htmlLoader.load(method, url, null, { method: method, url: url });
}

var HTMLLoader = (function() {

var HTMLLoader = function(options) {
	if (!(this instanceof HTMLLoader)) return new HTMLLoader(options);
	if (!options) return;
	var htmlLoader = this;
	each(options, function(key, val) {
		if (key == 'load') return;
		if (!(key in htmlLoader)) return;
		htmlLoader[key] = val;
	});
}

extend(HTMLLoader.prototype, {

load: function(method, url, data, details) {
	var htmlLoader = this;
	
	if (!details.url) details.url = url;
	
	return htmlLoader.request(method, url, data, details) // NOTE this returns the future that .then returns
		.then(
			function(doc) { if (htmlLoader.normalize) htmlLoader.normalize(doc, details); return doc; },
			function(err) { logger.error(err); throw (err); }
		);
},

serialize: function(data, details) { return ""; },  // TODO

request: function(method, url, data, details) {
	var sendText = null;
	method = lc(method);
	if ('post' == method) {
		throw "POST not supported"; // FIXME
		sendText = this.serialize(data, details);
	}
	else if ('get' == method) {
		// no-op
	}
	else {
		throw uc(method) + ' not supported';
	}
	return doRequest(method, url, sendText, details);
},

normalize: function(doc, details) {}

});

var doRequest = function(method, url, sendText, details) {
	var r, future = new Future(function() { r = this; });
	var xhr = window.XMLHttpRequest ?
		new XMLHttpRequest() :
		new ActiveXObject("Microsoft.XMLHTTP");
	xhr.onreadystatechange = onchange;
	xhr.open(method, url, true);
	xhr.send(sendText);
	function onchange() {
		if (xhr.readyState != 4) return;
		if (xhr.status != 200) {
			r.reject(xhr.status); // FIXME what should status be??
			return;
		}
		delay(0, onload); // Use delay to stop the readystatechange event interrupting other event handlers (on IE). 
	}
	function onload() {
		var doc = parseHTML(new String(xhr.responseText), details.url);
		r.accept(doc);
	}
	return future;
}

return HTMLLoader;

})();

var srcAttrs = {}, hrefAttrs = {};
forEach(words("link@<href script@<src img@<src iframe@<src video@<src audio@<src source@<src a@href area@href q@cite blockquote@cite ins@cite del@cite form@action input@formaction button@formaction"), function(text) {
	var m = text.split("@"), tag = m[0], attrName = m[1];
	if (attrName.charAt(0) == '<') srcAttrs[tag] = attrName.substr(1);
	else hrefAttrs[tag] = attrName;
});

var parseHTML = function(html, url) {
	var parser = new HTMLParser();
	return parser.parse(html, url);
}

var HTMLParser = (function() {
// This class allows external code to provide a `prepare(doc)` method for before content parsing.
// The main reason to do this is the so called `html5shiv`. 

var HTMLParser = function() { // TODO should this receive options like HTMLLoader??
	if (this instanceof HTMLParser) return;
	return new HTMLParser();
}

extend(HTMLParser.prototype, {

parse: function(html, url) {
	if (!url) throw "URL must be specified";
	var parser = this;
	
	// TODO disabling URLs would be faster if done with one regexp replace()
	// prevent resources (<img>, <link>, etc) from loading in parsing context, by renaming @src, @href to @meeko-src, @meeko-href
	var disableURLs = function(tag, attrName) {
		var vendorAttrName = vendorPrefix + "-" + attrName;
		html = html.replace(RegExp("<" + tag + "\\b[^>]*>", "ig"), function(tagString) {
			return tagString.replace(RegExp("\\b" + attrName + "=", "i"), vendorAttrName + "=");
		});
	}
	each(hrefAttrs, disableURLs);
	each(srcAttrs, disableURLs);
	
	// disable <script>
	// TODO currently handles script @type=""|"text/javascript"
	// What about "application/javascript", etc??
	html = html.replace(/<script\b[^>]*>/ig, function(tag) {
		if (/\btype=['"]?text\/javascript['"]?(?=\s|\>)/i.test(tag)) {
			return tag.replace(/\btype=['"]?text\/javascript['"]?(?=\s|\>)/i, 'type="text/javascript?disabled"');
		}
		return tag.replace(/\>$/, ' type="text/javascript?disabled">');
	});
	var iframe = document.createElement("iframe"),
	    docHead = document.head;
	iframe.name = "_decor";
	docHead.insertBefore(iframe, docHead.firstChild);
	var iframeDoc = iframe.contentWindow.document;

	if (parser.prepare) isolate(function() { parser.prepare(iframeDoc) }); // WARN external code
	iframeDoc.open();
	iframeDoc.write(html);
	iframeDoc.close();

	polyfill(iframeDoc);

	var baseURL = URL(url);
	
	// TODO not really sure how to handle <base href="..."> already in doc.
	// For now just honor them if present
	var base;
	forEach ($$("base", iframeDoc.head), function(node) {
		if (!node.getAttribute("href")) return;
		base = iframeDoc.head.removeChild(node);
	});
	if (base) baseURL = URL(baseURL.resolve(base.getAttribute('href')));
	
	forEach($$("style", iframeDoc.body), function(node) { // TODO support <style scoped>
		iframeDoc.head.appendChild(node);
	});
	var pseudoDoc = importDocument(iframeDoc);
	docHead.removeChild(iframe);

	function enableURLs(tag, attrName) { 
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
				baseURL.resolve(relURL);
			el.setAttribute(attrName, absURL);
		});
	}
	each(hrefAttrs, enableURLs);
	each(srcAttrs, enableURLs);

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
			switch(error.name) {
			case "NS_ERROR_DOM_SECURITY_ERR": case "SecurityError":
				return true;
			case "NS_ERROR_DOM_INVALID_ACCESS_ERR": case "InvalidAccessError":
				return false;
			default:
				return true; // FIXME what if Firefox changes the name again??
			}
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
	replaceNode: replaceNode, copyAttributes: copyAttributes, scrollToId: scrollToId, createDocument: createDocument,
	addEvent: addEvent, removeEvent: removeEvent, ready: domReady, overrideDefaultAction: overrideDefaultAction,
	URL: URL, HTMLLoader: HTMLLoader, HTMLParser: HTMLParser, loadHTML: loadHTML, parseHTML: parseHTML,
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
	var options = decor.options;
	var decorURL;
	return pipe(null, [
		
	function() {
		if (options.lookup) decorURL = options.lookup(document.URL);
		if (decorURL) return;
		if (options.detect) return wait(function() { return !!document.body; });
	},
	function() {
		if (!decorURL && options.detect) decorURL = options.detect(document);
		if (!decorURL) throw "No decor could be determined for this page";
		decorURL = URL(document.URL).resolve(decorURL);
		decor.current.url = decorURL;
	},
	function() {
		return decor.decorate(decorURL); // FIXME what if decorate fails??
	},
	function() {
		scrollToId(location.hash && location.hash.substr(1));

		if (!history.pushState) return;

		/*
			If this is the landing page then `history.state` will be null.
			But if there was a navigation back / forwards sequence then there could be `state`.
			Ideally the page would be in bfcache and this startup wouldn't even run,
			but that doesn't seem to work on Chrome & IE10.
		*/
		var state = history.state;
		if (panner.ownsState(state)) {
			panner.restoreState(state);
			panner.restoreScroll(state);
		}
		else {
			state = panner.createState({ url: document.URL });
			panner.commitState(state, true); // replaceState
			panner.saveScroll();
		}

		// NOTE fortuitously all the browsers that support pushState() also support addEventListener() and dispatchEvent()
		window.addEventListener("click", function(e) { panner.onClick(e); }, true);
		window.addEventListener("submit", function(e) { panner.onSubmit(e); }, true);
		window.addEventListener("popstate", function(e) { panner.onPopState(e); }, true);
		window.addEventListener('scroll', function(e) { panner.saveScroll(); }, false); // NOTE first scroll after popstate might be cancelled
	}
	
	]);
},

decorate: function(decorURL) {
	var doc, complete = false;
	var decorEnd;
	var decorReadyFu;
	var domReadyFu = new Future(function() {
		var r = this;
		DOM.ready(function() { r.accept(); });
	});
	var contentLoaded = false;
	domReadyFu.done(function() { contentLoaded = true; });

	if (getDecorMeta()) throw "Cannot decorate a document that has already been decorated";

	return pipe(null, [

	function() {
		var method = 'get';
		var f = decor.options.load(method, decorURL, null, { method: method, url: decorURL });
		f.done(
			function(result) { doc = result; },
			function(error) { logger.error("HTMLLoader failed for " + decorURL); } // FIXME need decorError notification / handling
		);
		return f;
	},
	function() {
		if (panner.options.normalize) return domReadyFu;
		else return wait(function() { return !!document.body; });
	},
	function() {
		if (panner.options.normalize) isolate(function() { panner.options.normalize(document, { url: document.URL }); });
		marker = document.createElement("meta");
		marker.name = "meeko-decor";
		document.head.insertBefore(marker, document.head.firstChild);
	},
	
	/* Now merge decor into page */
	function() {
		notify({
			module: "decor",
			stage: "before",
			type: "decorIn",
			node: doc
		});
		mergeHead(doc, true);
	},
	function() { return wait(function() { return scriptQueue.isEmpty(); }); }, // FIXME this should be in mergeHead
	function() {
		var contentStart = document.body.firstChild;
		decor_insertBody(doc);
		notify({
			module: "decor",
			stage: "after",
			type: "decorIn",
			node: doc
		});
		decorReadyFu = wait(function() { return checkStyleSheets(); });
		decorReadyFu.done(function() {
			notify({
				module: "decor",
				stage: "after",
				type: "decorReady",
				node: doc
			});
		});
		decorEnd = document.createTextNode("");
		document.body.insertBefore(decorEnd, contentStart);
		notify({
			module: "panner",
			stage: "before",
			type: "pageIn",
			node: document,
			target: document
		}); // TODO perhaps this should be stalled until scriptQueue.isEmpty() (or a config option)
	},
	function() {
		return wait(function() {
			var contentStart = decorEnd.nextSibling;
			if (contentStart) placeContent(
				contentStart,
				function(node, target) {
					decor.placeHolders[target.id] = target;
					notify({
						module: "panner",
						stage: "before",
						type: "nodeInserted",
						target: document.body,
						node: node
					});
				},
				function(node) {
					notify({
						module: "panner",
						stage: "after",
						type: "nodeInserted",
						target: document.body,
						node: node
					});
				}
			);
			return contentLoaded;
		});
	},
	function() { return wait(function() { return scriptQueue.isEmpty(); }); }, // FIXME this shouldn't have to poll
	function() { // NOTE resolve URLs in landing page
		// TODO could be merged with code in parseHTML
		var baseURL = URL(document.URL);
		function _resolve(el, attrName) {
			var relURL = el.getAttribute(attrName);
			if (relURL == null) return;
			var absURL = baseURL.resolve(relURL);
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
		notify({
			module: "panner",
			stage: "after",
			type: "pageIn",
			target: document
		});
	},
	function() { return decorReadyFu; }

	]);
}

});


extend(panner, {

onClick: function(e) {
	// NOTE only pushState enabled browsers use this
	// We want panning to be the default behavior for clicks on hyperlinks - <a href>
	// Before panning to the next page, have to work out if that is appropriate
	// `return` means ignore the click

	if (!decor.options.lookup) return; // no panning if can't lookup decor of next page
	
	if (e.button != 0) return; // FIXME what is the value for button in IE's W3C events model??
	if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return; // FIXME do these always trigger modified click behavior??

	// Find closest <a> to e.target
	for (var target=e.target; target!=document.body; target=target.parentNode) if (tagName(target) == "a") break;
	if (tagName(target) != "a") return; // only handling hyperlink clicks
	var href = target.getAttribute("href");
	if (!href) return; // not really a hyperlink
	
	// test hyperlinks
	if (target.target) return; // no iframe
	var baseURL = URL(document.URL);
	var url = baseURL.resolve(href); // TODO probably don't need to resolve on browsers that support pushstate
	var oURL = URL(url);
	if (oURL.nopathname != baseURL.nopathname) return; // no external urls
		
	// TODO perhaps should test same-site and same-page links
	var isPageLink = (oURL.nohash == baseURL.nohash); // TODO what about page-links that match the current hash
	// From here on we effectively take over the default-action of the event
	overrideDefaultAction(e, function(event) {
		if (isPageLink) panner.onPageLink(url);
		else panner.onSiteLink(url);
	});
},

onPageLink: function(url) {	// TODO Need to handle anchor links. The following just replicates browser behavior
	var state = panner.createState({ url: url });
	panner.commitState(state, false); // pushState
	scrollToId(URL(url).hash.substr(1));
},

onSiteLink: function(url) {	// Now attempt to pan
	panner.assign(url);
},

onSubmit: function(e) {
	// NOTE only pushState enabled browsers use this
	// We want panning to be the default behavior for <form> submission
	// Before panning to the next page, have to work out if that is appropriate
	// `return` means ignore the submit

	if (!decor.options.lookup) return; // no panning if can't lookup decor of next page
	
	// test submit
	var form = e.target;
	if (form.target) return; // no iframe
	var baseURL = URL(document.URL);
	var url = baseURL.resolve(form.action); // TODO probably don't need to resolve on browsers that support pushstate
	var oURL = URL(url);
	if (oURL.nopathname != baseURL.nopathname) return; // no external urls
	
	var method = lc(form.method);
	switch(method) {
	case 'get': break;
	default: return; // TODO handle POST
	}
	
	// From here on we effectively take over the default-action of the event
	overrideDefaultAction(e, function() {
		panner.onForm(form);
	});
},

onForm: function(form) {
	var method = lc(form.method);
	switch(method) {
	case 'get':
		var baseURL = URL(document.URL);
		var action = baseURL.resolve(form.action); // TODO probably not needed on browsers that support pushState
		var oURL = URL(action);
		var query = encode(form);
		var url = oURL.nosearch + (oURL.search || '?') + query + oURL.hash;
		panner.onSiteLink(url);
		break;
	default: return; // TODO handle POST
	}	

	function encode(form) {
		var data = [];
		forEach(form.elements, function(el) {
			if (!el.name) return;
			data.push(el.name + '=' + encodeURIComponent(el.value));
		});
		return data.join('&');
	}
},

onPopState: function(e) {
	var newState = e.state;
	if (!panner.ownsState(newState)) return;
	if (e.stopImmediatePropagation) e.stopImmediatePropagation();
	else e.stopPropagation();
	// NOTE there is no default-action for popstate

	var oldState = panner.state;
	var complete = false;
	var newURL = URL(newState.url).nohash;
	if (newURL != URL(oldState.url).nohash) {
		page(oldState, newState)
		.done(function() {
			panner.restoreScroll(newState);
			complete = true;
		});
	}
	else delay(0, function() {
		panner.restoreScroll(newState);
		complete = true;
	}, Future.pollingInterval);
	
	/*
	  All browsers seem to scroll the page around the popstate event.
	  This causes the page to jump at popstate, as though the content of the incoming state is already present.
	  There is an associated scroll event within a couple of milliseconds,
	  so the following listens for that event and restores the page offsets from the outgoing state.
	  If there is no scroll event then it is effectively a no-op. 
	*/
	panner.restoreState(newState);
	window.scroll(oldState.pageXOffset, oldState.pageYOffset); // TODO IE10 sometimes scrolls visibly before `scroll` event. This might help.
	// var refresh = document.documentElement.scrollTop;
	window.addEventListener('scroll', undoScroll, true);
	var count = 0;
	function undoScroll(scrollEv) { // undo the popstate triggered scroll if appropriate
		if (complete) {
			window.removeEventListener('scroll', undoScroll, true);
			return;
		}
		scrollEv.stopPropagation(); // prevent the saveScroll function
		scrollEv.preventDefault(); // TODO should really use this
		window.scroll(oldState.pageXOffset, oldState.pageYOffset);
		// var refresh = document.documentElement.scrollTop;
	}
},

assign: function(url) {
	return panner.navigate({
		url: url,
		replace: false
	});
},

replace: function(url) {
	return panner.navigate({
		url: url,
		replace: true
	});
},

navigate: function(options) {
	var r, f = new Future(function() { r = this; });
	var url = options.url;
	var decorURL = decor.options.lookup(url);
	if (typeof decorURL !== "string" || URL(document.URL).resolve(decorURL) !== decor.current.url) {
		var modifier = options.replace ? "replace" : "assign";
		location[modifier](url);
		r.accept();	// TODO should this be an error??
		return;
	}

	var oldState = panner.state;
	var newState = panner.createState({ // FIXME
		url: url
	});

	page(oldState, newState)
	.done(function(msg) {
		var oURL = URL(newState.url);
		scrollToId(oURL.hash && oURL.hash.substr(1));

		panner.saveScroll();

		r.accept(msg);
	});
	
	// Change document.URL
	// FIXME When should this happen?
	panner.commitState(newState, options.replace);
	
	return f;
},

bfcache: {},

createState: function(options) {
	var state = {
		'meeko-panner': true,
		pageXOffset: 0,
		pageYOffset: 0,
		url: null,
		timeStamp: +(new Date)
	};
	if (options) config(state, options);
	return state;
},

commitState: function(state, replace) {
	panner.state = state;
	var modifier = replace ? 'replaceState' : 'pushState';
	history[modifier](state, null, state.url);	
},

configState: function(options) {
	if (options) config(panner.state, options);
	history.replaceState(panner.state, null);
},

ownsState: function(state) {
	if (!state) state = history.state;
	if (!state) return false;
	return !!state['meeko-panner'];
},

restoreState: function(state) { // called from popstate
	if (!state) state = history.state;
	panner.state = state;
},

saveScroll: function() {
	panner.configState({pageXOffset: window.pageXOffset, pageYOffset: window.pageYOffset });
	history.replaceState(panner.state, null);	
},

restoreScroll: function(state) {
	if (!state) state = history.state;
	// if (!state['meeko-panner']) return;
	window.scroll(state.pageXOffset, state.pageYOffset);
}

});

/*
 Paging handlers are either a function, or an object with `before` and / or `after` listeners. 
 This means that before and after listeners are registered as a pair, which is desirable.
*/

decor.options = {
	lookup: function(url) {},
	detect: function(document) {},
	load: function(method, url, data, details) {
		var loader = new HTMLLoader(decor.options);
		return loader.load(method, url, data, details);
	}
	/* The following options are also available (unless otherwise indicated) *
	decorIn: { before: noop, after: noop },
	decorOut: { before: noop, after: noop }, // TODO not called at all
	decorReady: noop // TODO should this be decorIn:complete ??
	/**/
}

panner.options = { 
	duration: 0,
	load: function(method, url, data, details) {
		var loader = new HTMLLoader(panner.options);
		return loader.load(method, url, data, details);
	}
	/* The following options are also available *
	nodeRemoved: { before: hide, after: show },
	nodeInserted: { before: hide, after: show },
	pageOut: { before: noop, after: noop },
	pageIn: { before: noop, after: noop }
	/**/
}

var notify = function(msg) {
	var module = Meeko[msg.module];
	var handler = module.options[msg.type];
	if (!handler) return;
	var listener;

	if (handler[msg.stage]) listener = handler[msg.stage];

	else switch(msg.module) {
	case "panner":
		listener =	(msg.type == "nodeRemoved" || msg.type == "pageOut") ?
			(msg.stage == "before") ? handler : null :
			(msg.stage == "after") ? handler : null;
		break;
	case "decor":
		listener = (msg.type == "decorOut") ?
			(msg.stage == "before") ? handler : null :
			(msg.stage == "after") ? handler : null;
		break;
	default:
		throw msg.module + " is invalid module";
		break;
	}

	if (typeof listener == "function") isolate(function() { listener(msg); }); // TODO isFunction(listener)
}

var page = function(oldState, newState) {
	if (!getDecorMeta()) throw "Cannot page if the document has not been decorated"; // FIXME r.reject()

	var durationFu = delay(panner.options.duration);

	var oldDoc = panner.bfcache[oldState.timeStamp];
	if (!oldDoc) {
		oldDoc = document.implementation.createHTMLDocument(''); // FIXME
		panner.bfcache[oldState.timeStamp] = oldDoc;
	}
	var oldDocSaved = false;

	var newDoc, newDocFu;
	newDoc = panner.bfcache[newState.timeStamp];
	if (newDoc) newDocFu = Future.resolve(newDoc);
	else {
		var url = newState.url;
		var method = 'get'; // newState.method
		newDocFu = panner.options.load(method, url, null, { method: method, url: url });
		newDocFu.done(
			function(result) {
				newDoc = result;
				panner.bfcache[newState.timeStamp] = newDoc;
			},
			function(error) { logger.error("HTMLLoader failed"); } // FIXME page() will stall. Need elegant error handling
		);
	}

	var oldContent = getContent(oldDoc);
	var newContent;
	
	return pipe(null, [
		
	function() { // before pageOut / nodeRemoved
		notify({
			module: "panner",
			stage: "before",
			type: "pageOut",
			target: document
		});
		each(decor.placeHolders, function(id, node) {
			var target = $id(id);
			notify({
				module: "panner",
				stage: "before",
				type: "nodeRemoved",
				target: document.body,
				node: target // TODO rename `target` variable
			});
		});		
	},

	function() { return durationFu; },

	function() {
		if (newDoc) return; // pageIn will take care of pageOut

		separateHead(false, function(target) {
			oldDoc.head.appendChild(target); // FIXME will need to use some of mergeHead()
		});
		each(decor.placeHolders, function(id, node) {
			var target = $id(id);
			replaceNode(target, node);
			oldDoc.body.appendChild(target); // FIXME should use adoptNode()
			notify({
				module: "panner",
				stage: "after",
				type: "nodeRemoved",
				target: document.body,
				node: target
			});
		});
		oldDocSaved = true;
		notify({
			module: "panner",
			stage: "after",
			type: "pageOut",
			target: document
		});		
	},

	function() { return newDocFu; },
		
	function() { // before pageIn
		notify({
			module: "panner",
			stage: "before",
			type: "pageIn",
			target: document,
			node: newDoc
		});
	},

	function() { // pageIn
		var r, f = new Future(function() { r = this; });
		newContent = getContent(newDoc);
		
		mergeHead(newDoc, false, function(target) {
			if (!oldDocSaved) oldDoc.head.appendChild(target);
		});
		var nodeList = [];
		placeContent(newContent, // FIXME uses locally-scoped implementation of placeContent()
			function(node, target) {
				notify({
					module: "panner",
					stage: "before",
					type: "nodeInserted",
					target: document.body,
					node: node
				});
			},
			function(node, target) {
				if (!oldDocSaved) oldDoc.body.appendChild(target);
				nodeList.push(node);
				delay(0, function() {
					notify({
						module: "panner",
						stage: "after",
						type: "nodeInserted",
						target: document.body,
						node: node
					});
					remove(nodeList, node);
					if (!nodeList.length) r.accept();
				});
			}
		);
	},
	
	function() { return wait(function() { return scriptQueue.isEmpty(); }); }, // FIXME scriptQueue should be synced with a Future
	
	function() { // after pageIn
		notify({
			module: "panner",
			stage: "after",
			type: "pageIn",
			target: document
		});
	}
	
	]);
	
	// NOTE page() returns now. The following functions are hoisted
	
	function getContent(doc) {
		var content = {};
		each(decor.placeHolders, function(id) {
			content[id] = $id(id, doc);
		});
		return content;
	}

	function placeContent(content, beforeReplace, afterReplace) { // this should work for content from both internal and external documents
		each(decor.placeHolders, function(id) {
			var node = content[id];
			if (!node) {
				console.log(id + ' not found');
				return;
			}
			var target = $id(id);
			// TODO compat check between node and target
			if (beforeReplace) beforeReplace(node, target);
			replaceNode(target, node);
			if (afterReplace) afterReplace(node, target);
		});
	}

	
}


function separateHead(isDecor, afterRemove) { // FIXME more callback than just afterRemove?
	var dstHead = document.head;
	var marker = getDecorMeta();
	if (!marker) throw "No meeko-decor marker found. ";

	// remove decor / page elements except for <script type=text/javascript>
	forSiblings (isDecor ? "before" : "after", marker, function(node) {
		if (tagName(node) == "script" && (!node.type || node.type.match(/^text\/javascript/i))) return;
		dstHead.removeChild(node);
		if (afterRemove) afterRemove(node);
	});	
}

function mergeHead(doc, isDecor, afterRemove) { // FIXME more callback than just afterRemove?
	var baseURL = URL(document.URL);
	var dstHead = document.head;
	var marker = getDecorMeta();
	if (!marker) throw "No meeko-decor marker found. ";

	separateHead(isDecor, afterRemove);

	// remove duplicate scripts from srcHead
	var srcHead = doc.head;
	forSiblings ("starting", srcHead.firstChild, function(node) {
		switch(tagName(node)) {
		case "script":
			if (every($$("script", dstHead), function(el) {
				return baseURL.resolve(el.src) != node.src; // FIXME @src should already be resolved to absURL
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

/*
 We want <script>s to execute in document order (unless @async present)
 but also want <script src>s to download in parallel.
 The script queue inserts scripts until it is paused on a blocking script.
 The onload (or equivalent) or onerror handlers of the blocking script restart the queue.
 Inline <script> and <script src="..." async> are never blocking.
 Sync <script src> are blocking, but if `script.async=false` is supported by the browser
 then only the last <script src> (in a series of sync scripts) needs to pause the queue. See
	http://wiki.whatwg.org/wiki/Dynamic_Script_Execution_Order#My_Solution
 Script preloading is always performed, even if the browser doesn't support it. See
	http://wiki.whatwg.org/wiki/Dynamic_Script_Execution_Order#readyState_.22preloading.22
*/
var queue = [],
	pending = false,
	blockingScript;
	
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

var testScript = document.createElement('script'),
	supportsOnLoad = (testScript.setAttribute('onload', 'void(0)'), typeof testScript.onload === 'function'),
	supportsSync = (testScript.async === true);

var queueScript = function(script, node) {
	queue.push({ script: script, node: node });
	if (blockingScript) return;
	processQueue();
}

var processQueue = function(e) {
	if (e) {
		var script = e.target || e.srcElement;
		removeListeners(script);
	}
	if (pending) return;
	delay(0, _processQueue);
	pending = true;
}

var _processQueue = function() {
	pending = false;
	blockingScript = null;
	while (!blockingScript && queue.length > 0) {
		var spec = queue.shift(), script = spec.script, node = spec.node, nextScript = queue.length && queue[0].script;
		if (script.src && !script.getAttribute("async") && (!supportsSync || !nextScript || !nextScript.src || nextScript.getAttribute("async"))) {
			blockingScript = spec;
			addListeners(script);
		}
		if (supportsSync && !script.getAttribute('async')) script.async = false;
		replaceNode(node, script);
	}
}

function addListeners(script) {
	if (supportsOnLoad) addEvent(script, "load", processQueue);
	else addEvent(script, 'readystatechange', readyStateHandler);
	addEvent(script, "error", processQueue); // TODO error message? browser generates one	
}

function removeListeners(script) {
	if (supportsOnLoad) removeEvent(script, 'load', processQueue);
	else removeEvent(script, 'readystatechange', readyStateHandler);
	removeEvent(script, 'error', processQueue);		
}

function readyStateHandler(e) { // for IE <= 8 which don't support script.onload
	var script = e.target || e.srcElement;
	if (script.complete) return;
	switch (script.readyState) {
	case "loaded": case "complete":
		script.complete = true; // TODO probably not necessary if removeListeners() here
		processQueue(e);
		break;
	default: break;
	}	
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
