/*!
 * Copyright 2009-2014 Sean Hogan (http://meekostuff.net/)
 * Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
 */

/* TODO
    + substantial error handling and notification needs to be added
    + <link rel="self" />
    + Would be nice if more of the internal functions were called as method, eg DOM.ready()...
        this would allow the boot-script to modify them as appropriate
    + Up-front feature testing to prevent boot on unsupportable platorms...
        e.g. can't create HTML documents
    + Can decorate() and pan() share more code?
 */

// FIXME for IE7, IE8 sometimes XMLHttpRequest is in a detectable but not callable state
// This is usually fixed by refreshing, or by the following work-around.
// OTOH, maybe my IE installation is bad
var XMLHttpRequest = window.XMLHttpRequest; 

(function() {

var window = this;
var document = window.document;

var defaults = { // NOTE defaults also define the type of the associated config option
	"log_level": "warn",
	"polling_interval": 50
}

var vendorPrefix = "meeko";

var Meeko = window.Meeko || (window.Meeko = {});

/*
 ### Utility functions
 */

var uc = function(str) { return str.toUpperCase(); }
var lc = function(str) { return str.toLowerCase(); }

var remove = function(a, item) { // remove the first instance of `item` in `a`
	for (var n=a.length, i=0; i<n; i++) {
		if (a[i] !== item) continue;
		a.splice(i, 1);
		return;
	}	
}
var forEach = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) fn.call(context, a[i], i, a); }

var some = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) { if (fn.call(context, a[i], i, a)) return true; } return false; }

var every = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) { if (!fn.call(context, a[i], i, a)) return false; } return true; }

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
	uc: uc, lc: lc, forEach: forEach, some: some, every: every, words: words, each: each, extend: extend, config: config, trim: trim
});


/*
 ### Logger (minimal implementation - can be over-ridden)
 */
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


/*
 ### Task queuing and isolation
 */

// NOTE Task.asap could use window.setImmediate, except for
// IE10 CPU contention bugs http://codeforhire.com/2013/09/21/setimmediate-and-messagechannel-broken-on-internet-explorer-10/

var Task = (function() {

var asapQueue = [];
var deferQueue = [];
var scheduled = false;
var processing = false;

function asap(fn) {
	asapQueue.push(fn);
	if (processing) return;
	if (scheduled) return;
	schedule(processTasks);
	scheduled = true;
}

function defer(fn) {
	if (processing) {
		deferQueue.push(fn);
		return;
	}
	asap(fn);
}

function delay(fn, timeout) {
	if (timeout <= 0 || timeout == null) {
		defer(fn);
		return;
	}

	setTimeout(function() {
		isolate(fn);
		processTasks();
	}, timeout);
}

// NOTE schedule used to be approx: setImmediate || postMessage || setTimeout
var schedule = window.setTimeout;

function processTasks() {
	processing = true;
	var task;
	while (asapQueue.length) {
		task = asapQueue.shift();
		if (typeof task !== 'function') continue;
		var success = isolate(task);
		// FIXME then what??
	}
	scheduled = false;
	processing = false;
	
	asapQueue = deferQueue;
	deferQueue = [];
	if (asapQueue.length) {
		schedule(processTasks);
		scheduled = true;
	}
}


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


return {
	asap: asap,
	defer: defer,
	delay: delay,
	isolate: isolate
};

})(); // END Task

/*
 ### Promise
 WARN: This was based on early DOM Futures specification. This has been evolved towards ES6 Promises.
 */

var Promise = Meeko.Promise = function(init) { // `init` is called as init(resolve, reject)
	if (!(this instanceof Promise)) return new Promise(init);
	
	var promise = this;
	promise._initialize();

	if (init === undefined) return;

	function resolve(result) { promise._resolve(result); }
	function reject(error) { promise._reject(error); }

	try { init(resolve, reject); }
	catch(error) { reject(error); }
	// NOTE promise is returned by `new` invocation
}

extend(Promise.prototype, {

_initialize: function() {
	var promise = this;
	promise._acceptCallbacks = [];
	promise._rejectCallbacks = [];
	promise._accepted = null;
	promise._result = null;
	promise._willCatch = false;
	promise._processing = false;
},

_accept: function(result, sync) { // NOTE equivalent to "accept algorithm". External calls MUST NOT use sync
	var promise = this;
	if (promise._accepted != null) return;
	promise._accepted = true;
	promise._result = result;
	promise._requestProcessing(sync);
},

_resolve: function(value, sync) { // NOTE equivalent to "resolve algorithm". External calls MUST NOT use sync
	var promise = this;
	if (promise._accepted != null) return;
	if (value != null && typeof value.then === 'function') {
		try {
			value.then(
				function(result) { promise._resolve(result); },
				function(error) { promise._reject(error); }
			);
		}
		catch(error) {
			promise._reject(error, sync);
		}
		return;
	}
	// else
	promise._accept(value, sync);
},

_reject: function(error, sync) { // NOTE equivalent to "reject algorithm". External calls MUST NOT use sync
	var promise = this;
	if (promise._accepted != null) return;
	promise._accepted = false;
	promise._result = error;
	if (!promise._willCatch) {
		Task.asap(function() {
			if (!promise._willCatch) throw error;
		});
	}
	else promise._requestProcessing(sync);
},

_requestProcessing: function(sync) { // NOTE schedule callback processing. TODO may want to disable sync option
	var promise = this;
	if (promise._accepted == null) return;
	if (promise._processing) return;
	if (sync) {
		promise._processing = true;
		promise._process();
		promise._processing = false;
	}
	else {
		Task.asap(function() {
			promise._processing = true;
			promise._process();
			promise._processing = false;
		});
	}
},

_process: function() { // NOTE process a promises callbacks
	var promise = this;
	var result = promise._result;
	var callbacks, cb;
	if (promise._accepted) {
		promise._rejectCallbacks.length = 0;
		callbacks = promise._acceptCallbacks;
	}
	else {
		promise._acceptCallbacks.length = 0;
		callbacks = promise._rejectCallbacks;
	}
	while (callbacks.length) {
		cb = callbacks.shift();
		if (typeof cb === 'function') cb(result);
	}
},

then: function(acceptCallback, rejectCallback) {
	var promise = this;
	return new Promise(function(resolve, reject) {
		var acceptWrapper = acceptCallback ?
			wrapResolve(acceptCallback, resolve, reject) :
			function(value) { resolve(value); }
	
		var rejectWrapper = rejectCallback ? 
			wrapResolve(rejectCallback, resolve, reject) :
			function(error) { reject(error); }
	
		promise._acceptCallbacks.push(acceptWrapper);
		promise._rejectCallbacks.push(rejectWrapper);
	
		promise._willCatch = true;
	
		promise._requestProcessing();
		
	});
},

'catch': function(rejectCallback) { // FIXME 'catch' is unexpected identifier in IE8-
	var promise = this;
	return promise.then(null, rejectCallback);
}

});


/* Functional composition wrapper for `then` */
function wrapResolve(callback, resolve, reject) {
	return function() {
		try {
			var value = callback.apply(undefined, arguments); 
			resolve(value);
		} catch(error) {
			reject(error);
		}
	}
}


extend(Promise, {

resolve: function(value) {
return new Promise(function(resolve, reject) {
	resolve(value);
});
},

reject: function(error) {
return new Promise(function(resolve, reject) {
	reject(error);
});
}

});


/*
 ### Async functions
   wait(test) waits until test() returns true
   asap(fn) returns a promise which is fulfilled / rejected by fn which is run asap after the current micro-task
   delay(timeout) returns a promise which fulfils after timeout ms
   pipe(startValue, [fn1, fn2, ...]) will call functions sequentially
 */
var wait = (function() { // TODO wait() isn't used much. Can it be simpler?
	
var tests = [];

function wait(fn) {
return new Promise(function(resolve, reject) {
	var test = { fn: fn, resolve: resolve, reject: reject };
	asapTest(test);
});
}

function asapTest(test) {
	return asap(test.fn)
	.then(function(done) {
		if (done) test.resolve();
		else deferTest(test);
	},
	function(error) {
		test.reject(error);
	});
}

function deferTest(test) {
	var started = tests.length > 0;
	tests.push(test);
	if (!started) Task.delay(poller, Promise.pollingInterval); // NOTE polling-interval is configured below
}

function poller() {
	var currentTests = tests;
	tests = [];
	preach(currentTests, function(i, test) {
		return asapTest(test);
	});
}

return wait;

})();

var asap = function(fn) { return Promise.resolve().then(fn); }

function delay(timeout) {
return new Promise(function(resolve, reject) {
	if (timeout <= 0 || timeout == null) Task.defer(resolve);
	else Task.delay(resolve, timeout);
});
}

function pipe(startValue, fnList) {
	var promise = Promise.resolve(startValue);
	while (fnList.length) { 
		var fn = fnList.shift();
		promise = promise.then(fn);
	}
	return promise;
}

function preach(src, fn) {
return new Promise(function(resolve, reject) {

	var mode =
		(typeof src === 'function') ? 'function' :
		(src == null) ? 'null' :
		('length' in src) ? 'array' :
		'object';
	if (mode === 'null') throw 'src cannot be null in preach(src, fn)';
	if (mode === 'object') {
		var keys = [], n = 0;
		each(src, function(k, v) { keys[n++] = k; });
	}

	var i = 0;
	next();
	return;

	function next() {
		asap(callback)['catch'](errCallback);		
	}
	function callback() {
		var key, value;
		switch (mode) {
		case 'function':
			key = i;
			value = src(key);
			break;
		case 'array':
			if (i >= src.length) {
				resolve();
				return;
			}
			key = i;
			value = src[key];
			break;
		case 'object':
			if (i >= keys.length) {
				resolve();
				return;
			}
			key = keys[i];
			value = src[key];
			break;
		}
		i++;
		var current = Promise.resolve(value)
		.then(function(val) {
			if (mode === 'function' && val == null) {
				resolve();
				return;
			}
			var result = fn(key, val, src);
			current.then(next);
			return result;
		});
		return current;
	}
	function errCallback(error) {
		reject(error);
	}
	
});
}

Promise.pollingInterval = defaults['polling_interval'];

extend(Promise, {
	asap: asap, delay: delay, wait: wait, pipe: pipe
});



/*
 ### DOM utility functions
 */
var tagName = function(el) { return el && el.nodeType === 1 ? lc(el.tagName) : ""; }

var $id = function(id, doc) {
	if (!id) return;
	if (!doc) doc = document;
	if (!doc.getElementById) throw 'Context for $id must be a Document node';
	var node = doc.getElementById(id);
	if (!node) return;
	if (node.id === id) return node;
	// work around for broken getElementById in old IE
	var nodeList = doc.getElementsByName(id);
	for (var n=nodeList.length, i=0; i<n; i++) {
		node = nodeList[i];
		if (node.id == id) return node;
	}
}
var $$ = function(selector, context) { // WARN only selects by tagName
	context = context || document;
	var nodeList = [];
	try { 
		var coll = context.getElementsByTagName(selector);
		for (var i=0, n=coll.length; i<n; i++) nodeList[i] = coll[i];
	}
	catch (error) {
		throw (selector + " can only be a tagName selector in $$()");
	}
	return nodeList;
}

var forSiblings = function(conf, refNode, conf2, refNode2, fn) {
	if (!refNode || !refNode.parentNode) return;
	if (typeof conf2 === 'function') {
		fn = conf2;
		conf2 = null;
		refNode2 = null;
	}
	var node, stopNode, first = refNode.parentNode.firstChild;
	
	conf = lc(conf);
	if (conf2) {
		conf2 = lc(conf2);
		if (conf === 'ending' || conf === 'before') throw 'forSiblings startNode looks like stopNode';
		if (conf2 === 'starting' || conf2 === 'after') throw 'forSiblings stopNode looks like startNode';
	}
	
	switch (conf) {
	case "starting": node = refNode; break;
	case "after": node = refNode.nextSibling; break;
	case "ending": node = first; stopNode = refNode.nextSibling; break;
	case "before": node = first; stopNode = refNode; break;
	default: throw conf + " is not a valid configuration in forSiblings";
	}
	if (conf2) switch (conf2) {
	case "ending": stopNode = refNode2.nextSibling; break;
	case "before": stopNode = refNode2; break;
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
	var doc = current.ownerDocument;
	if (doc.adoptNode) next = doc.adoptNode(next); // Safari 5 was throwing because imported nodes had been added to a document node
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

var hasAttribute = document.documentElement.hasAttribute ?
function(node, attrName) { return node.hasAttribute(attrName); } :
function(node, attrName) { var attr = node.getAttributeNode(attrName); return (attr == null) ? false : attr.specified; }; // IE <= 7

var copyAttributes = function(node, srcNode) { // implements srcNode.cloneNode(false)
	var attrs = srcNode.attributes;
	forEach(attrs, function(attr) {
		if (!attr.specified) return;
		node.setAttribute(attr.name, attr.value); // FIXME does this work for @class?
	});
	return node;
}

var removeAttributes = function(node) {
	var attrs = [];
	forEach(node.attributes, function(attr) {
		if (attr.specified) attrs.push(attr.name);
	});
	forEach(attrs, function(attrName) {
		node.removeAttribute(attrName); // FIXME does this work for @class?
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

var createHTMLDocument = document.implementation.createHTMLDocument && function(title) {
	return document.implementation.createHTMLDocument(title);
} ||
function(titleText) { // TODO space optimization
	var doc = createDocument();
	var parent = doc;
	var docEl;
	// the following is equivalent of `doc.innerHTML = '<html><head><title>' + titleText + '</title></head><body></body></html>';`
	forEach(words('html head title body'), function(tagName) {
		var el = doc.createElement(tagName);
		parent.appendChild(el);
		switch (tagName) {
		case 'title':
			el.appendChild(doc.createTextNode(titleText));
			parent = docEl;
			break;
		case 'html':
			docEl = el;
			// fall-thru
		default:
			parent = el;
			break;
		}
	});
	return doc;
};

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

var readyStateLookup = { // used in domReady() and checkStyleSheets()
	"uninitialized": false,
	"loading": false,
	"interactive": false,
	"loaded": true,
	"complete": true
}

var domReady = (function() { // WARN this assumes that document.readyState is valid or that content is ready...

var readyState = document.readyState;
var loaded = readyState ? readyStateLookup[readyState] : true;
var queue = [];

function domReady(fn) {
	if (typeof fn !== 'function') return;
	queue.push(fn);
	if (loaded) processQueue();
}

function processQueue() {
	forEach(queue, function(fn) { setTimeout(fn); });
	queue.length = 0;
}

var events = {
	"DOMContentLoaded": document,
	"load": window
};

if (!loaded) each(events, function(type, node) { addEvent(node, type, onLoaded); });

return domReady;

// NOTE the following functions are hoisted
function onLoaded(e) {
	loaded = true;
	each(events, function(type, node) { removeEvent(node, type, onLoaded); });
	processQueue();
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
	
	asap(function() {
		window.removeEventListener(e.type, backstop, false);
		if (defaultPrevented) return;
		fn(e);
	});
}

var URL = (function() {

// TODO is this URL class compatible with the proposed DOM4 URL class??

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
	this.origin = this.protocol + (this.supportsResolve ? '//' : '') + this.host;
	this.basepath = this.pathname.replace(/[^\/]*$/,'');
	this.base = this.origin + this.basepath;
	this.nosearch = this.origin + this.pathname;
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
		substr1 == '/' ? this.origin + relURL :
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
			return this.origin + myDir + myRel;
		}).call(this);
	return absURL;
}


return URL;

})();

var neutralProtocol = vendorPrefix + '-href:';
var neutralProtocolLen = neutralProtocol.length;
function neutralizeURL(url) {
	return neutralProtocol + url;
}
function deneutralizeURL(url) {
	var confirmed = url.indexOf(neutralProtocol) === 0;
	if (confirmed) return url.substr(neutralProtocolLen);
	return url;
}

extend(URL, {
	neutralProtocol: neutralProtocol,
	neutralize: neutralizeURL,
	deneutralize: deneutralizeURL
});

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
		if (key === 'load') return;
		if (!(key in htmlLoader)) return;
		htmlLoader[key] = val;
	});
}

extend(HTMLLoader.prototype, {

load: function(method, url, data, details) {
	var htmlLoader = this;
	
	if (!details) details = {};
	if (!details.url) details.method = method;	
	if (!details.url) details.url = url;
	
	return htmlLoader.request(method, url, data, details) // NOTE this returns the promise that .then returns
		.then(
			function(doc) {
				if (htmlLoader.normalize) htmlLoader.normalize(doc, details);
				if (details.isNeutralized) deneutralizeAll(doc);
				return doc;
			},
			function(err) { logger.error(err); throw (err); } // FIXME
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

var HTML_IN_XHR = (function() { // FIXME more testing, especially Webkit. Probably should use data-uri testing
	if (!window.XMLHttpRequest) return false;
	var xhr = new XMLHttpRequest;
	if (!('responseType' in xhr)) return false;
	if (!('response' in xhr)) return false;
	xhr.open('get', document.URL, true);

	try { xhr.responseType = 'document'; } // not sure if any browser throws for this, but they should
	catch (err) { return false; }

	try { if (xhr.responseText == '') return false; } // Opera-12. Other browsers will throw
	catch(err) { }

	try { if (xhr.status) return false; } // this should be 0 but throws on Chrome and Safari-5.1
	catch(err) { // Chrome and Safari-5.1
		xhr.abort(); 
		try { xhr.responseType = 'document'; } // throws on Safari-5.1 which doesn't support HTML requests 
		catch(err2) { return false; }
	}

	return true;
})();

var doRequest = function(method, url, sendText, details) {
return new Promise(function(resolve, reject) {
	var xhr = window.XMLHttpRequest ?
		new XMLHttpRequest :
		new ActiveXObject("Microsoft.XMLHTTP"); // TODO stop supporting IE6
	xhr.onreadystatechange = onchange;
	xhr.open(method, url, true);
	if (HTML_IN_XHR) xhr.responseType = 'document';
	xhr.send(sendText);
	function onchange() {
		if (xhr.readyState != 4) return;
		if (xhr.status != 200) { // FIXME what about other status codes?
			reject(xhr.status); // FIXME what should status be??
			return;
		}
		asap(onload); // Use delay to stop the readystatechange event interrupting other event handlers (on IE). 
	}
	function onload() {
		var doc;
		if (HTML_IN_XHR) {
			var doc = xhr.response;
			prenormalize(doc, details);
			resolve(doc);
		}
		else {
			var parserFu = parseHTML(new String(xhr.responseText), details); // TODO should parseHTML be async?
			resolve(parserFu);
		}
	}
});
}

return HTMLLoader;

})();

/*
	STAGING_DOCUMENT_IS_INERT indicates whether resource URLs - like img@src -
	need to be neutralized so they don't start downloading until after the document is normalized. 
	The normalize function might discard them in which case downloading is a waste. 
*/

var STAGING_DOCUMENT_IS_INERT = (function() {

	try { var doc = document.implementation.createHTMLDocument(''); }
	catch (error) { return false; } // IE <= 8
	if (doc.URL !== document.URL) return true; // FF, Webkit, Chrome
	// TODO the following feature detection needs more cross-browser testing
	/*
		Use a data-uri image to see if browser will try to fetch.
		The smallest such image might be a 1x1 white gif,
		see http://proger.i-forge.net/The_smallest_transparent_pixel/eBQ
	*/
	var img = doc.createElement('img');
	if (img.complete) img.src = 'data:'; // Opera-12
	if (img.complete) return false; // paranoia
	img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=';
	if (img.width) return false; // IE9, Opera-12 will have width == 1 / height == 1 
	if (img.complete) return false; // Opera-12 sets this immediately. IE9 sets it after a delay. 
	return true; // Presumably IE10

})();

/*
	IE9 swallows <source> elements that aren't inside <video> or <audio>
	See http://www.w3.org/community/respimg/2012/03/06/js-implementation-problem-with/
	Safari-4 also has this issue
*/
var IE9_SOURCE_ELEMENT_BUG = (function() { 
	var frag = document.createDocumentFragment();
	var doc = frag.createElement ? frag : document;
	doc.createElement('source'); // See html5shiv
	var div = doc.createElement('div');
	frag.appendChild(div);
	div.innerHTML = '<div><source /><div>';
	return 'source' !== tagName(div.firstChild.firstChild);
})();

var testURL = 'test.html';
/*
  IE <= 7 auto resolves some URL attributes.
  After setting the attribute to a relative URL you might only be able to read the absolute URL.
  Because HTMLParser writes into an iframe where contentDocument.URL is about:blank or document.URL
  relative URLs can be resolved to the wrong URL.
  canResolve() helps to detect this auto resolve behavior.
*/
var canResolve = (function() { 
	var a;
	try {
		a = document.createElement('<a href="' + testURL +'">');
		return !!a && a.tagName === 'A';
	}
	catch(err) { return false; }
})();

var AttrDesc = function(tagName, attrName, loads) {
	var testEl = document.createElement(tagName);
	var supported = attrName in testEl;
	var lcAttr = lc(attrName); // NOTE for longDesc, etc
	var resolves = false;
	if (supported && canResolve) {
		testEl = document.createElement('<' + tagName + ' ' + lcAttr + '="' + testURL + '">');
		resolves = testEl.getAttribute(lcAttr) !== testURL;
	}
	var neutralize = !supported ? 0 :
		!loads && !resolves ? 0 :
		STAGING_DOCUMENT_IS_INERT ? -1 :
		!loads ? -1 :
		1;
	extend(this, { // attrDesc
		tagName: tagName,
		attrName: attrName,
		loads: loads,
		supported: supported,
		resolves: resolves,
		mustResolve: false,
		neutralize: neutralize
	});
}

extend(AttrDesc.prototype, {

resolve: function(el, baseURL, force, neutralized, stayNeutral) {
	var attrName = this.attrName;
	var url = el.getAttribute(attrName);
	if (url == null) return;
	var finalURL = this.resolveURL(url, baseURL, force, neutralized, stayNeutral)
	if (finalURL !== url) el.setAttribute(attrName, finalURL);
},

resolveURL: function(url, baseURL, force, neutralized, stayNeutral) {
	var relURL = trim(url);
	if (neutralized) {
		relURL = deneutralizeURL(url);
		if (relURL === url) logger.warn('Expected neutralized attribute: ' + this.tagName + '@' + this.attrName);
	}
	var finalURL = relURL;
	if (force) switch (relURL.charAt(0)) {
		case '': // empty, but not null
		case '#': // NOTE anchor hrefs aren't normalized
		case '?': // NOTE query hrefs aren't normalized
			break;
		
		default:
			finalURL = baseURL.resolve(relURL);
			break;
	}
	if (stayNeutral) finalURL = neutralizeURL(finalURL);
	return finalURL;
}

});

var urlAttrs = {};
forEach(words("link@<href script@<src img@<longDesc,<src,srcset iframe@<longDesc,<src object@<data embed@<src video@<poster,<src audio@<src source@<src,srcset input@formAction,<src button@formAction,<src a@ping,href area@href q@cite blockquote@cite ins@cite del@cite form@action"), function(text) {
	var m = text.split("@"), tagName = m[0], attrs = m[1];
	var attrList = urlAttrs[tagName] = {};
	forEach(attrs.split(','), function(attrName) {
		var downloads = false;
		if (attrName.charAt(0) === '<') {
			downloads = true;
			attrName = attrName.substr(1);
		}
		attrList[attrName] = new AttrDesc(tagName, attrName, downloads);
	});
});

urlAttrs['script']['src'].mustResolve = true;

function resolveSrcset(urlSet, baseURL, force) { // img@srcset will never be neutralized
	if (!force) return urlSet;
	var urlList = urlSet.split(/\s*,\s*/); // WARN this assumes URLs don't contain ','
	forEach(urlList, function(urlDesc, i) {
		urlList[i] = urlDesc.replace(/^\s*(\S+)(?=\s|$)/, function(all, url) { return baseURL.resolve(url); });
	});
	return urlList.join(', ');
}

urlAttrs['img']['srcset'].resolveURL = resolveSrcset;
urlAttrs['source']['srcset'].resolveURL = resolveSrcset;

urlAttrs['a']['ping'].resolveURL = function(urlSet, baseURL, force) { // a@ping will never be neutralized
	if (!force) return urlSet;
	var urlList = urlSet.split(/\s+/);
	forEach(urlList, function(url, i) {
		urlList[i] = baseURL.resolve(url);
	});
	return urlList.join(' ');
}

var resolveAll = function(doc, baseURL, isNeutralized, mustResolve) { // NOTE mustResolve is true unless explicitly `false`
	mustResolve = !(mustResolve === false); 

	each(urlAttrs, function(tag, attrList) {
		var elts;
		function getElts() {
			if (!elts) elts = $$(tag, doc);
			return elts;
		}

		each(attrList, function(attrName, attrDesc) {
			var force = !!mustResolve || attrDesc.mustResolve; // WARN scripts MUST be resolved because they stay in the page after panning
			var neutralized = isNeutralized && !!attrDesc.neutralize;
			var stayNeutral = isNeutralized && attrDesc.neutralize > 0;

			if (!force && (!neutralized || neutralized && stayNeutral)) return; // if don't have to resolve and neutralization doesn't change then skip

			forEach(getElts(), function(el) {
				attrDesc.resolve(el, baseURL, force, neutralized, stayNeutral);
			});
		});
	});
	
	return isNeutralized && !STAGING_DOCUMENT_IS_INERT;
}

var deneutralizeAll = function(doc) {

	each(urlAttrs, function(tag, attrList) {
		var elts;
		function getElts() {
			if (!elts) elts = $$(tag, doc);
			return elts;
		}

		each(attrList, function(attrName, attrDesc) {
			var neutralized = attrDesc.neutralize > 0;

			if (!neutralized) return;

			forEach(getElts(), function(el) {
				var url = el.getAttribute(attrName);
				if (url == null) return;
				var finalURL = deneutralizeURL(url, tag, attrName);
				if (finalURL !== url) el.setAttribute(attrName, finalURL);
			});
		});
	});
}

if (IE9_SOURCE_ELEMENT_BUG) {

var _resolveAll = resolveAll;
resolveAll = function(doc) {
	
	var elts = $$('img', doc);
	for (var i=elts.length-1; i>=0; i--) {
		var el = elts[i];
		var realTag = el.getAttribute('meeko-tag');
		if (realTag) {
			el.removeAttribute('meeko-tag');
			var realEl = doc.createElement(realTag);
			copyAttributes(realEl, el);
			el.parentNode.replaceChild(realEl, el);
		}
	}
	
	return _resolveAll.apply(null, arguments);
}

} // end if IE9_SOURCE_ELEMENT_BUG


function prenormalize(doc, details) { // NOTE only for native parser
	polyfill(doc);

	forEach($$('script', doc), function(node) {
		if (!node.type || /^text\/javascript$/i.test(node.type)) node.type = "text/javascript?disabled";
	});

	forEach($$("style", doc.body), function(node) { // TODO support <style scoped>
		doc.head.appendChild(node);
	});

	var baseURL = URL(details.url);
	var mustResolve = !(details.mustResolve === false); // WARN mustResolve is true unless explicitly false
	resolveAll(mustResolve ? doc : doc.head, baseURL, false, mustResolve);

	return doc;	
}

var parseHTML = function(html, details) {
	var parser = new HTMLParser();
	return parser.parse(html, details);
}

var HTMLParser = (function() {
// This class allows external code to provide a `prepare(doc)` method for before content parsing.
// The main reason to do this is the so called `html5shiv`. 

var HTMLParser = function() { // TODO should this receive options like HTMLLoader??
	if (this instanceof HTMLParser) return;
	return new HTMLParser();
}

var HTML_IN_DOMPARSER = (function() {

	try {
		var doc = (new DOMParser).parseFromString('', 'text/html');
		return !!doc;
	}
	catch(err) { return false; }

})();

function nativeParser(html, details) {

	return pipe(null, [
		
	function() {
		var doc = (new DOMParser).parseFromString(html, 'text/html');
		prenormalize(doc, details);
		return doc;		
	}
	
	]);

}

function iframeParser(html, details) {
	var parser = this;
	
	var iframe = document.createElement("iframe");
	iframe.name = "meeko-parser";
	var iframeHTML = '';

	return pipe(null, [
	
	function() {
		html = preparse(html);

		var bodyIndex = html.search(/<body(?=\s|>)/); // FIXME assumes "<body" not in a script or style comment somewhere 
		bodyIndex = html.indexOf('>', bodyIndex) + 1;
		iframeHTML = html.substr(0, bodyIndex);
		html = html.substr(bodyIndex);

		var head = document.head;
		head.insertBefore(iframe, head.firstChild);
		var iframeDoc = iframe.contentWindow.document;
		iframeDoc.open('text/html', 'replace');
		return iframeDoc;
	},
	
	function(iframeDoc) {
		if (parser.prepare) parser.prepare(iframeDoc); // WARN external code
		return iframeDoc;
	},		

	function(iframeDoc) {
		return new Promise(function(resolve, reject) {
			// NOTE need to wait for iframeWin.onload on Android 2.3, others??
			var iframeWin = iframe.contentWindow, complete = false;
			iframeWin.onload = iframeDoc.onreadystatechange = function() { // WARN sometimes `onload` doesn't fire on IE6
				if (complete) return;
				var readyState = iframeDoc.readyState;
				if (readyState && readyState !== 'complete') return;
				complete = true;
				resolve(iframeDoc);
			}

			iframeDoc.write(iframeHTML);
			iframeDoc.close();
		});
	},
	
	function(iframeDoc) {

		polyfill(iframeDoc);

		var baseURL = URL(details.url);
		
		// TODO not really sure how to handle <base href="..."> already in doc.
		// For now just honor them if present
		// TODO also not sure how to handle <base target="...">, etc
		var baseHref;
		forEach ($$("base", iframeDoc.head), function(node) {
			var href = node.getAttribute("href");
			if (!href) return;
			baseHref = href;
			node.removeAttribute('href');
		});
		if (baseHref) baseURL = URL(baseURL.resolve(baseHref));

		var doc = importDocument(iframeDoc);
	
		document.head.removeChild(iframe);

		doc.body.innerHTML = '<wbr />' + html; // one simple trick to get IE <= 8 to behave
		doc.body.removeChild(doc.body.firstChild);

		forEach($$("style", doc.body), function(node) { // TODO support <style scoped>
			doc.head.appendChild(node);
		});

		details.isNeutralized = resolveAll(doc, baseURL, true, details.mustResolve);
		// FIXME need warning for doc property mismatches between page and decor
		// eg. charset, doc-mode, content-type, etc
		return doc;
	}

	]);	
	
}

var preparse = (function() {
	
var urlElts = [];

each(urlAttrs, function(tagName, attrList) {
	var neutralized = false;
	each(attrList, function(attrName, attrDesc) {
		if (attrDesc.neutralize) neutralized = true;
		extend(attrDesc, {
			regex: new RegExp('(\\s)(' + attrName + ')\\s*=\\s*([\'"])?\\s*(?=\\S)', 'ig') // captures preSpace, attrName, quote. discards other space
		});
	});
	if (neutralized) urlElts.push(tagName);
});

var preparseRegex = new RegExp('(<)(' + urlElts.join('|') + '|\\/script|style|\\/style)(?=\\s|\\/?>)([^>]+)?(>)', 'ig');

function preparse(html) { // neutralize URL attrs @src, @href, etc

	var mode = 'html';
	html = html.replace(preparseRegex, function(tagString, lt, tag, attrsString, gt) {
		var tagName = lc(tag);
		if (!attrsString) attrsString = '';
		if (tagName === '/script') {
			if (mode === 'script') mode = 'html';
			return tagString;
		}
		if (tagName === '/style') {
			if (mode === 'style') mode = 'html';
			return tagString;
		}
		if (mode === 'script' || mode === 'style') {
			return tagString;
		}
		if (tagName === 'style') {
			mode = 'style';
			return tagString;
		}
		if (IE9_SOURCE_ELEMENT_BUG && tagName === 'source') {
			tag = 'img meeko-tag="source"';
		}
		each(urlAttrs[tagName], function(attrName, attrDesc) {
			if (attrDesc.neutralize) attrsString = attrsString.replace(attrDesc.regex, function(all, preSpace, attrName, quote) {
				return preSpace + attrName + '=' + (quote || '') + neutralProtocol;
			});
		});
		if (tagName === 'script') {
			mode = 'script';
			attrsString = disableScript(attrsString);
		}
		return lt + tag + attrsString + gt;
	});

	return new String(html);
	
	function disableScript(attrsString) {
		var hasType = false;
		var attrs = attrsString.replace(/(\stype=)['"]?([^\s'"]*)['"]?(?=\s|$)/i, function(m, $1, $2) {
			hasType = true;
			var isJS = ($2 === '' || /^text\/javascript$/i.test($2));
			return isJS ? $1 + '"text/javascript?disabled"' : m;
		}); 
		return hasType ? attrs : attrsString + ' type="text/javascript?disabled"';
	}

}

return preparse;

})();


// TODO should these functions be exposed on `DOM`?
var importDocument = document.importNode ? // NOTE returns a pseudoDoc
function(srcDoc) {
	var doc = createDocument();
	var docEl = document.importNode(srcDoc.documentElement, true);
	doc.appendChild(docEl);
	polyfill(doc);

	// WARN sometimes IE9 doesn't read the content of inserted <style>
	forEach($$("style", doc), function(node) {
		if (node.styleSheet && node.styleSheet.cssText == "") node.styleSheet.cssText = node.innerHTML;		
	});
	
	return doc;
} :
function(srcDoc) {
	var doc = createDocument();

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
	
	doc.appendChild(docEl);
	polyfill(doc);

	/*
	 * WARN on IE6 `element.innerHTML = ...` will drop all leading <script> and <style>
	 * Work-around this by prepending some benign element to the src <body>
	 * and removing it from the dest <body> after the copy is done
	 */
	// NOTE we can't just use srcBody.cloneNode(true) because html5shiv doesn't work
	if (HTMLParser.prototype.prepare) HTMLParser.prototype.prepare(doc); // TODO maybe this should be in createDocument

	var srcBody = srcDoc.body;
	srcBody.insertBefore(srcDoc.createElement('wbr'), srcBody.firstChild);

	var html = srcBody.innerHTML; // NOTE timing the innerHTML getter and setter showed that all the overhead is in the iframe
	docBody.innerHTML = html; // setting innerHTML in the pseudoDoc has minimal overhead.

	docBody.removeChild(docBody.firstChild); // TODO assert firstChild.tagName == 'wbr'

	return doc;
}

// FIXME should be named importSingleNode or something
var importNode = document.importNode ? // NOTE only for single nodes, especially elements in <head>. 
function(srcNode) { 
	return document.importNode(srcNode, false);
} :
composeNode; 


extend(HTMLParser.prototype, {
	parse: HTML_IN_DOMPARSER ? nativeParser : iframeParser
});

return HTMLParser;

})();


/* 
NOTE:  for more details on how checkStyleSheets() works cross-browser see 
http://aaronheckmann.blogspot.com/2010/01/writing-jquery-plugin-manager-part-1.html
TODO: does this still work when there are errors loading stylesheets??
*/
var checkStyleSheets = function() { // TODO would be nice if this didn't need to be polled
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
				return true;
			}
		} 
	});
}

// proxy for `history` especially to guarantee `history.state` for older Webkit browsers that DO support `history.pushState`
var historyProxy = (function() {

var historyProxy = {};

if (!history.pushState) return historyProxy;

extend(historyProxy, {

state: undefined,

pushState: function(object, title, url) {
	updateState(object);
	if (typeof url === "undefined") history.pushState(object, title);
	else history.pushState(object, title, url);
},

replaceState: function(object, title, url) {
	updateState(object);
	if (typeof url === "undefined") history.replaceState(object, title);
	else history.replaceState(object, title, url);
}

});

window.addEventListener('popstate', function(e) { updateState(e.state); });

function updateState(src) {
	if (typeof src === 'object' && src !== null) {
		historyProxy.state = {};
		config(historyProxy.state, src);
	}
	else historyProxy.state = src;
}

return historyProxy;

})();


var polyfill = function(doc) { // NOTE more stuff could be added here if *necessary*
	if (!doc) doc = document;
	if (!doc.head) doc.head = firstChild(doc.documentElement, "head");
}


var DOM = Meeko.DOM || (Meeko.DOM = {});
extend(DOM, {
	$id: $id, $$: $$, tagName: tagName, hasAttribute: hasAttribute, forSiblings: forSiblings, matchesElement: matchesElement, firstChild: firstChild,
	replaceNode: replaceNode, copyAttributes: copyAttributes, scrollToId: scrollToId, createDocument: createDocument, createHTMLDocument: createHTMLDocument,
	addEvent: addEvent, removeEvent: removeEvent, ready: domReady, overrideDefaultAction: overrideDefaultAction,
	URL: URL, HTMLLoader: HTMLLoader, HTMLParser: HTMLParser, loadHTML: loadHTML, parseHTML: parseHTML,
	polyfill: polyfill
});


polyfill();


var decor = Meeko.decor = {};
var panner = Meeko.panner = {};

panner.config = decor.config = function(options) { // same method. different context object.
	config(this.options, options);
}

extend(decor, {

started: false,
current: {
	url: null
},
placeHolders: {},

start: function(startOptions) {
return bfScheduler.now(function() {

	var contentDocument;
	
	if (decor.started) throw "Already started";
	decor.started = true;
	
	var domReadyFu = startOptions && startOptions.contentDocument ?
		startOptions.contentDocument :
		new Promise(function(resolve, reject) {
			DOM.ready(function() { resolve(document); });
		});

	var options = decor.options;
	var decorURL, decorDocument;

	return pipe(null, [
		
	function() { // lookup or detect decorURL
		if (options.lookup) decorURL = options.lookup(document.URL);
		if (decorURL) return;
		if (options.detect) return domReadyFu
			.then(function(doc) {
				decorURL = options.detect(doc);
			});
	},
	function() { // initiate fetch of decorURL
		if (!decorURL) throw "No decor could be determined for this page";
		decorURL = URL(document.URL).resolve(decorURL);
		decor.current.url = decorURL;
		var method = 'get';
		var f = decor.options.load(method, decorURL, null, { method: method, url: decorURL });
		f.then(
			function(result) { decorDocument = result; },
			function(error) { logger.error("HTMLLoader failed for " + decorURL); } // FIXME need decorError notification / handling
		);
		return f;
	},
	
	function() {
		return wait(function() { return !!document.body; });		
	},

	function() { resolveURLs(); },
	
	function() { // the order of decorate, pageIn (and whether to normalize) depends on whether content is from external document or the default document
		if (startOptions && startOptions.contentDocument) return pipe(null, [
		function() {
			return decor.decorate(decorDocument, decorURL); // FIXME what if decorate fails??
		},
		function() {
			return startOptions.contentDocument
			.then(function(doc) {
				if (panner.options.normalize) panner.options.normalize(doc, { url: document.URL });
				if (!STAGING_DOCUMENT_IS_INERT) deneutralizeAll(doc);
				return doc;
			})
			.then(function(doc) {
				return pageIn(null, doc); // NOTE this returns the saved landing document
			});
		}
		]);
		else return pipe(null, [
		function() {
			if (panner.options.normalize) return domReadyFu.then(function() {
				panner.options.normalize(document, { url: document.URL });
			});
		},			
		function() {
			return decor.decorate(decorDocument, decorURL); // FIXME what if decorate fails??
		},
		function() {
			return pageIn(null, null); // NOTE this returns the saved landing document
		}
		]);
	},
	function(landingDocument) {
		scrollToId(location.hash && location.hash.substr(1));

		if (!historyProxy.pushState) return;

		/*
			If this is the landing page then `history.state` will be null.
			But if there was a navigation back / forwards sequence then there could be `state`.
			Ideally the page would be in bfcache and this startup wouldn't even run,
			but that doesn't seem to work on Chrome & IE10.
		*/
		var state;
		if (panner.ownsBrowserState(historyProxy.state)) {
			state = panner.getStateFromBrowserState(historyProxy.state);
			panner.restoreState(state);
			panner.restoreScroll(state);
		}
		else {
			state = panner.createState({ url: document.URL });
			panner.commitState(state, true); // replaceState
			panner.saveScroll(state);
		}

		panner.bfcache[state.cacheId] = landingDocument;
		
		// NOTE fortuitously all the browsers that support pushState() also support addEventListener() and dispatchEvent()
		window.addEventListener("click", function(e) { panner.onClick(e); }, true);
		window.addEventListener("submit", function(e) { panner.onSubmit(e); }, true);
		window.addEventListener("popstate", function(e) { panner.onPopState(e); }, true);
		window.addEventListener('scroll', function(e) { panner.saveScroll(panner.getState()); }, false); // NOTE first scroll after popstate might be cancelled
	}
	
	]);

});
	// start() returns now. The following are hoisted
	
	function resolveURLs() { // NOTE resolve URLs in landing page
		// TODO could be merged with code in parseHTML
		var baseURL = URL(document.URL);
		function _resolveAttr(el, attrName) {
			var relURL = el.getAttribute(attrName);
			if (relURL == null) return;
			var absURL = baseURL.resolve(relURL);
			el.setAttribute(attrName, absURL);
		}
		
		function resolveAttr(el, attrName) {
			if (tagName(el) != 'script') return _resolveAttr(el, attrName);		
			var scriptType = el.type;
			var isJS = (!scriptType || /^text\/javascript/i.test(scriptType));
			if (isJS) el.type = "text/javascript?complete"; // IE6 and IE7 will re-execute script if @src is modified (even to same path)
			_resolveAttr(el, attrName);
		}
		
		forSiblings("starting", document.head.firstChild, function(node) {
			switch (tagName(node)) {
			case 'script':
				resolveAttr(node, 'src');
				break;
			case 'link':
				resolveAttr(node, 'href');
				break;
			}
		});
	}


},

decorate: function(decorDocument, decorURL) {

	if (getDecorMarker()) throw "Cannot decorate a document that has already been decorated";

	var selfMarker;
	
	return pipe(null, [

	function() {
		selfMarker = getSelfMarker();
		if (selfMarker) return;
		selfMarker = document.createElement("link");
		selfMarker.rel = "meeko-self";
		selfMarker.href = document.URL;
		document.head.insertBefore(selfMarker, document.head.firstChild);
		
	},
	function() {
		var marker = document.createElement("link");
		marker.rel = "meeko-decor-active";
		marker.href = decorURL;
		document.head.insertBefore(marker, selfMarker);
	},
	
	function() {
		return notify({
			module: "decor",
			stage: "before",
			type: "decorIn",
			node: decorDocument
		});
	},
	function() {
		mergeElement(document.documentElement, decorDocument.documentElement);
		mergeElement(document.head, decorDocument.head);
		mergeHead(decorDocument, true);
	},
	function() { return scriptQueue.empty(); }, // FIXME this should be in mergeHead
	function() {
		var contentStart = document.body.firstChild;
		var decorEnd = document.createElement('plaintext');
		decorEnd.setAttribute('style', 'display: none;');
		document.body.insertBefore(decorEnd, contentStart);

		mergeElement(document.body, decorDocument.body);
		decor_insertBody(decorDocument);
	},
	function() {
		return notify({
			module: "decor",
			stage: "after",
			type: "decorIn",
			node: decorDocument
		});
	},
	function() { return scriptQueue.empty(); },
	function() { // this doesn't stall the Promise returned by decorate() 
		wait(function() { return checkStyleSheets(); })
		.then(function() {
			return notify({
				module: "decor",
				stage: "after",
				type: "decorReady",
				node: decorDocument
			});
		});
	}

	]);

	// NOTE decorate() returns now. The following functions are hoisted
	
	function mergeElement(dst, src) { // TODO this removes all dst (= content) attrs and imports all src (= decor) attrs. Is this appropriate?
		removeAttributes(dst);
		copyAttributes(dst, src);
		dst.removeAttribute('style'); // FIXME is this appropriate? There should at least be a warning
	}

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
	for (var target=e.target; target!=document; target=target.parentNode) if (tagName(target) == "a") break;
	if (tagName(target) != "a") return; // only handling hyperlink clicks
	var href = target.getAttribute("href");
	if (!href) return; // not really a hyperlink

	// test hyperlinks
	if (target.target) return; // no iframe
	var baseURL = URL(document.URL);
	var url = baseURL.resolve(href); // TODO probably don't need to resolve on browsers that support pushstate
	var oURL = URL(url);
	if (oURL.origin != baseURL.origin) return; // no external urls
		
	// TODO perhaps should test same-site and same-page links
	var isPageLink = (oURL.nohash == baseURL.nohash); // TODO what about page-links that match the current hash
	// From here on we effectively take over the default-action of the event
	overrideDefaultAction(e, function(event) {
		if (isPageLink) panner.onPageLink(url);
		else panner.onSiteLink(url);
	});
},

onPageLink: function(url) {	// TODO Need to handle anchor links. The following just replicates browser behavior
	panner.assign(url);
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
	if (oURL.origin != baseURL.origin) return; // no external urls
	
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

handlePopState: function(newState) {
	var oldState = panner.getState();
	panner.restoreState(newState);

	if (newState.cacheId != oldState.cacheId) {
		return pan(oldState, newState)
			.then(function() {
				panner.restoreScroll(newState);
			});
	}
	else return asap(function() {
		panner.restoreScroll(newState);
	});
},

onPopState: function(e) {
	var browserState = e.state;
	if (!panner.ownsBrowserState(browserState)) { // FIXME how to stop external use of history.pushState() ??
		logger.warn('HTMLDecor should be the only history.state manager');
		return;
	}
	if (e.stopImmediatePropagation) e.stopImmediatePropagation();
	else e.stopPropagation();
	// NOTE there is no default-action for popstate

	var newState = panner.getStateFromBrowserState(browserState);
	bufferPopState(newState);

	/*
	  All browsers seem to scroll the page around the popstate event.
	  This causes the page to jump at popstate, as though the content of the incoming state is already present.
	  There is an associated scroll event within a couple of milliseconds,
	  so the following listens for that event and restores the page offsets from the outgoing state.
	  If there is no scroll event then it is effectively a no-op. 
	*/

	var oldState = panner.getState();
	panner.restoreScroll(oldState); // TODO IE10 sometimes scrolls visibly before `scroll` event. This might help.
	// var refresh = document.documentElement.scrollTop;
	window.addEventListener('scroll', undoScroll, true);
	setTimeout(function() { window.removeEventListener('scroll', undoScroll, true); });

	function undoScroll(scrollEv) { // undo the popstate triggered scroll if appropriate
		scrollEv.stopPropagation(); // prevent the saveScroll function
		scrollEv.preventDefault(); // TODO should really use preventDefault() instead of stopPropagation()
		panner.restoreScroll(oldState);
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

navigate: historyProxy.pushState ? navigate : defaultNavigate,

stateId: null,
stateTable: {},
bfcache: {},

createState: function(options) {
	var timeStamp = +(new Date);
	var state = {
		'meeko-panner': true,
		pageXOffset: 0,
		pageYOffset: 0,
		url: null,
		timeStamp: timeStamp,
		cacheId: timeStamp // WARN this will be over-ridden for same-page links
	};
	if (options) config(state, options);
	return state;
},

commitState: function(state, replace) {
	var timeStamp = state.timeStamp;
	panner.stateTable[timeStamp] = state;
	panner.stateId = timeStamp;

	var modifier = replace ? 'replaceState' : 'pushState';
	historyProxy[modifier](state, null, state.url);	
	return state;
},

updateState: function(options) {
	var state = panner.getState();
	config(state, options);
	var browserState = historyProxy.state;
	if (panner.ownsBrowserState(browserState) && browserState.timeStamp === state.timeStamp) {
		historyProxy.replaceState(state);
	}
},

ownsBrowserState: function(browserState) {
	if (!browserState) browserState = historyProxy.state;
	if (!browserState) return false;
	return !!browserState['meeko-panner'];
},

getStateFromBrowserState: function(browserState) {
	if (!browserState) browserState = historyProxy.state;
	if (!panner.ownsBrowserState(browserState)) return;
	var timeStamp = browserState.timeStamp;
	var state = panner.stateTable[timeStamp];
	if (!state) panner.stateTable[timeStamp] = state = browserState;
	return state;
},

getState: function() {
	var state = panner.stateTable[panner.stateId];
	return state;
},

restoreState: function(state) {
	panner.stateId = state.timeStamp;
},

saveScroll: function(state) {
	var msg = 'saveScroll(state) not in sync with panner.state';
	if (state && state.timeStamp !== panner.getState().timeStamp) {
		logger.warn(msg);
		return;
	}
	panner.updateState({pageXOffset: window.pageXOffset, pageYOffset: window.pageYOffset });
},

restoreScroll: function(state) {
	var msg = 'restoreScroll(state) not in sync with panner.state';
	if (state && state.timeStamp !== panner.getState().timeStamp) {
		logger.warn(msg);
		return;
	}
	window.scroll(state.pageXOffset, state.pageYOffset);
}

});

function navigate(options) {
	
return bfScheduler.now( // grab token immediately or fail
	function() {
		var url = options.url;
	
		var baseURL = URL(document.URL);
		var oURL = URL(url);
		var isPageLink = (oURL.nohash === baseURL.nohash); // TODO what about page-links that match the current hash
	
		var oldState = panner.getState();
		var newState = panner.createState({ url: url });
	
		if (isPageLink) return (function() {
			newState.cacheId = oldState.cacheId;
			panner.commitState(newState, false); // pushState
			scrollToId(oURL.hash.substr(1));
			panner.saveScroll(newState);
		})();
	
		var decorURL = decor.options.lookup(url);
		if (typeof decorURL !== "string" || URL(document.URL).resolve(decorURL) !== decor.current.url) return (function() {
			var modifier = options.replace ? "replace" : "assign";
			location[modifier](url);
			// NOTE discard newState
		})();
	
		// Change document.URL
		// FIXME When should this happen?
		panner.commitState(newState, options.replace);
	
		return pan(oldState, newState)
		.then(function() {
			var oURL = URL(newState.url);
			scrollToId(oURL.hash && oURL.hash.substr(1));
			panner.saveScroll(newState);
		});
		
	},
	function() {
		logger.warn('Panner busy when attempting to navigate');
	}

);
}

function defaultNavigate(options) {
return new Promise(function(resolve, reject) {
	var url = options.url;
	var modifier = options.replace ? "replace" : "assign";
	location[modifier](url);
	resolve();
});
}

var bufferPopState = (function() {
	
	var nextStateQueue = [];
	var processing = false;
	var done;
	
	function push(newState) {
		nextStateQueue.push(newState);
		bump();
	}
	
	function bump() {
		if (processing) return;
		processing = true;
		bfScheduler.whenever(process);
	}
	
	function process() {
		if (nextStateQueue.length <= 0) {
			processing = false;
			return;
		}
		var newState = nextStateQueue.pop();
		nextStateQueue.length = 0;
		return panner.handlePopState(newState)
		.then(process); // FIXME what about errors
	}
	
	return push;
	
})();

var bfScheduler = (function() {
	
var queue = [];
var maxSize = 1;
var processing = false;

function bump() {
	if (processing) return;
	processing = true;
	process();
}

function process() {
	if (queue.length <= 0) {
		processing = false;
		return;
	}
	var task = queue.shift();
	var promise = asap(task.fn);
	promise.then(process, process);
	promise.then(task.resolve, task.reject);
}

var bfScheduler = {
	
now: function(fn, fail) {
	return this.whenever(fn, fail, 0);
},

whenever: function(fn, fail, max) {
return new Promise(function(resolve, reject) {

	if (max == null) max = maxSize;
	if (queue.length > max || (queue.length === max && processing)) {
		if (fail) asap(fail).then(resolve, reject);
		else reject();
		return;
	}
	queue.push({ fn: fn, resolve: resolve, reject: reject });

	bump();
});
}

}

return bfScheduler;

})();

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
		details.mustResolve = false;
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
	if (!handler) return Promise.resolve();
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

	if (typeof listener == "function") {
		var promise = asap(function() { listener(msg); }); // TODO isFunction(listener)
		promise['catch'](function(err) { throw err; });
		return promise;
	}
	else return Promise.resolve();
}

var pan = function(oldState, newState) {
	if (!getDecorMarker()) throw "Cannot pan if the document has not been decorated"; // FIXME r.reject()

	var durationFu = delay(panner.options.duration);
	var oldDoc = panner.bfcache[oldState.cacheId];
	if (!oldDoc) {
		oldDoc = createHTMLDocument('');
		panner.bfcache[oldState.cacheId] = oldDoc;
	}
	var oldDocSaved = false;

	var newDoc, newDocFu;
	newDoc = panner.bfcache[newState.cacheId];
	if (newDoc) {
		newDocFu = Promise.resolve(newDoc);
	}
	else {
		var url = newState.url;
		var method = 'get'; // newState.method
		newDocFu = panner.options.load(method, url, null, { method: method, url: url });
		newDocFu.then(
			function(result) {
				newDoc = result;
				panner.bfcache[newState.cacheId] = newDoc;
			},
			function(error) { logger.error("HTMLLoader failed"); } // FIXME pan() will stall. Need elegant error handling
		);
	}
	
	return pipe(null, [
		
	function() { // before pageOut 
		return notify({
			module: "panner",
			stage: "before",
			type: "pageOut",
			target: document
		});
	},
	function() { // before nodeRemoved
		return preach(decor.placeHolders, function(id, node) {
			var target = $id(id);
			return notify({
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

		return preach(decor.placeHolders, function(id, node) {
			var target = $id(id);
			replaceNode(target, node);
			var placeHolder = $id(id, oldDoc);
			// FIXME should check that `placeHolder` is a shallow-clone of `target`
			if (placeHolder) replaceNode(placeHolder, target); // FIXME should use adoptNode()
			else { // FIXME assume this is the first time oldDoc is being populated
				oldDoc.body.appendChild(target); // FIXME should use adoptNode()
			}
			return notify({
				module: "panner",
				stage: "after",
				type: "nodeRemoved",
				target: document.body,
				node: target
			});
		})
		.then(function() { oldDocSaved = true; });
	},
	function() {
		return notify({
			module: "panner",
			stage: "after",
			type: "pageOut",
			target: document
		});		
	},

	function() { return newDocFu; },
	
	function() { return pageIn(oldDocSaved ? null : oldDoc, newDoc); },
	
	function() {
		var selfMarker = getSelfMarker();
		selfMarker.href = newState.url;
	}
	
	]);

}

function pageIn(oldDoc, newDoc) {
/* NOTE:
 `newDoc` undefined means this is a *landing* page AND capturing is OFF
 `oldDoc` undefined means this is a *landing* page OR old-content has already been paged out (by `page()`)
 */
	var returnDoc;
	return pipe(null, [
		
	function() { // before pageIn
		return notify({
			module: "panner",
			stage: "before",
			type: "pageIn",
			target: document,
			node: newDoc
		});
	},

	function() {
		if (newDoc) return normalPageIn();
		newDoc = createHTMLDocument(''); // FIXME this doesn't work for IE <= 8
		return landingPageIn();
	},
	
	function(doc) { returnDoc = doc; },
	
	function() { return scriptQueue.empty(); },
	
	function() { // after pageIn
		return notify({
			module: "panner",
			stage: "after",
			type: "pageIn",
			target: document
		});
	},
	
	function() { return returnDoc; }

	]);
	
	function normalPageIn() { // `newDoc` is stand-along, `oldDoc` may exist
		return pipe(null, [

		function() {
			mergeHead(newDoc, false, function(target) {
				if (oldDoc) oldDoc.head.appendChild(target);
			});
		},
		
		function() {
			var cursor = newDoc.body.firstChild;
			var afterReplaceFu;
			
			return preach(function(i) { // NOTE if this sourcing function returns nothing (or a promise that resolves with nothing) then preach() terminates
				var node = cursor;
				cursor = cursor && cursor.nextSibling;
				return node;
			},
			function(i, node) {
				var id = node.id;
				if (!id) return;
				var target = $id(node.id);
				if (!target) return;
				// TODO compat check between node and target
				return beforeReplace(node, target)
				.then(function() {
					var newPlaceHolder = node.cloneNode(false);
					replaceNode(node, newPlaceHolder);
					replaceNode(target, node);
					if (oldDoc) {
						var oldPlaceHolder = $id(target.id, oldDoc);
						if (oldPlaceHolder) { // FIXME should test that oldPlaceHolder is shallow-clone of target & is child of oldDoc.body
							replaceNode(oldPlaceHolder, target); // FIXME should use adoptNode()
						}
						else { // FIXME assuming first time populating `oldDoc`
							oldDoc.body.appendChild(target); // FIXME should use adoptNode();
						}
					}
					else decor.placeHolders[target.id] = target;
				}).
				then(function() { afterReplaceFu = afterReplace(node, target); });
			})
			.then(function() { return afterReplaceFu; }); // this will be the last `afterReplaceFu`
		},
		
		function() {
			return newDoc;
		}
			
		]);
	}

	function landingPageIn() { // there will be no `oldDoc`, `newDoc` is empty, content-nodes are sourced from `document` at end-of-decor
		return pipe(null, [

		function() {
			var contentLoaded = false;
			DOM.ready(function() { contentLoaded = true; });
			var decorEnd = $$('plaintext')[0];
			var afterReplaceFu;
			
			return preach(function(i) { // NOTE if this sourcing function returns nothing (or a promise that resolves with nothing) then preach() terminates
				return wait(function() { return decorEnd.nextSibling || contentLoaded; })
					.then(function() {
						return decorEnd.nextSibling;
					});
			},
			function(i, node) {
				var target;
				var id = node.id;
				if (id) target = $id(id);
				if (!target || target === node) return wait(function() { // nowhere for content-node to be placed
					try { node.parentNode.removeChild(node); }
					catch (error) { return false; }
					newDoc.body.appendChild(node); // FIXME should use adoptNode()
					return true;
				});
				
				// TODO compat check between node and target
				return beforeReplace(node, target)
				.then(function() {
					var placeHolder = node.cloneNode(false);
					return wait(function() {
						try { replaceNode(target, node); } // NOTE throws in IE <= 8 if node is still loading. Very slow in IE9 on large pages.
						catch (error) { return false; } // TODO what error does IE throw? Is it always because the node is still loading?
						newDoc.body.appendChild(placeHolder); // FIXME should use adoptNode()
						decor.placeHolders[target.id] = target;
						return true;
					});
				}).
				then(function() { afterReplaceFu = afterReplace(node, target); });
			})
			.then(function() { return afterReplaceFu; }) // this will be the last `afterReplaceFu`
			.then(function() { return newDoc; });
		}
					
		]);
	}


	function beforeReplace(node, target) {
		return notify({
			module: "panner",
			stage: "before",
			type: "nodeInserted",
			target: document.body,
			node: node
		});
	}
	function afterReplace(node, target) {
		return delay(0).then(function() {
			return notify({
				module: "panner",
				stage: "after",
				type: "nodeInserted",
				target: document.body,
				node: node
			});
		});
	}

}


function separateHead(isDecor, afterRemove) { // FIXME more callback than just afterRemove?
	var dstHead = document.head;
	if (!getDecorMarker()) throw "No meeko-decor marker found. ";

	// remove decor / page elements except for <script type=text/javascript>
	if (isDecor) forSiblings("after", getDecorMarker(), "before", getSelfMarker(), remove);
	else forSiblings("after", getSelfMarker(), remove);
	
	function remove(node) {
		if (tagName(node) == "script" && (!node.type || node.type.match(/^text\/javascript/i))) return;
		dstHead.removeChild(node);
		if (afterRemove) afterRemove(node);
	}
}

function mergeHead(doc, isDecor, afterRemove) { // FIXME more callback than just afterRemove?
	var baseURL = URL(document.URL);
	var dstHead = document.head;
	var decorMarker = getDecorMarker();
	if (!decorMarker) throw "No meeko-decor marker found. ";
	var marker = getSelfMarker();

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
			if (isDecor) return; // ignore <title> in decor. FIXME what if topic content has no <title>?
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

	forSiblings ("before", content, enableScripts);
	
	function enableScripts(node) {
		if (node.nodeType !== 1) return;
		if ("script" === tagName(node)) scriptQueue.push(node);
		else forEach($$("script", node), function(script) { scriptQueue.push(script); });
	}
}

var scriptQueue = new function() {

/*
 WARN: This description comment was from the former scriptQueue implementation.
 It is still a correct description of behavior,
 but doesn't give a great insight into the current Promises-based implementation.
 
 We want <script>s to execute in document order (unless @async present)
 but also want <script src>s to download in parallel.
 The script queue inserts scripts until it is paused on a blocking script.
 The onload (or equivalent) or onerror handlers of the blocking script restart the queue.
 Inline <script> and <script src="..." async> are never blocking.
 Sync <script src> are blocking, but if `script.async=false` is supported by the browser
 then only the last <script src> (in a series of sync scripts) needs to pause the queue. See
	http://wiki.whatwg.org/wiki/Dynamic_Script_Execution_Order#My_Solution
 Script preloading is always initiated, even if the browser doesn't support it. See
	http://wiki.whatwg.org/wiki/Dynamic_Script_Execution_Order#readyState_.22preloading.22
*/
var queue = [],
	emptying = false;

var testScript = document.createElement('script'),
	supportsOnLoad = (testScript.setAttribute('onload', ';'), typeof testScript.onload === 'function'),
	supportsSync = (testScript.async === true);

this.push = function(node) {
	if (emptying) throw 'Attempt to append script to scriptQueue while emptying';
	
	// TODO assert node is in document

	var completeRe, completeFu = new Promise(function(resolve, reject) { completeRe = { resolve: resolve, reject: reject }; });	

	if (!/^text\/javascript\?disabled$/i.test(node.type)) {
		completeRe.resolve();
		logger.info("Unsupported script-type " + node.type);
		return completeFu;
	}

	var script = document.createElement("script");

	// preloadedFu is needed for IE <= 8
	// On other browsers (and for inline scripts) it is pre-accepted
	var preloadedRe, preloadedFu = new Promise(function(resolve, reject) { preloadedRe = { resolve: resolve, reject: reject }; }); 
	if (!node.src || supportsOnLoad) preloadedRe.resolve(); // WARN must use `node.src` because attrs not copied to `script` yet
	if (node.src) addListeners(); // WARN must use `node.src` because attrs not copied to `script` yet
	
	copyAttributes(script, node); 

	// FIXME is this comprehensive?
	if ('text' in node) script.text = node.text; // all IE, current non-IE
	else if ('textContent' in node) script.textContent = node.textContent; // old non-IE
	else if (node.firstChild) script.appendChild(document.createTextNode(node.firstChild.nodeValue)); // really old non-IE

	if (script.getAttribute('defer')) { // @defer is not appropriate. Implement as @async
		script.removeAttribute('defer');
		script.setAttribute('async', '');
		logger.warn('@defer not supported on scripts');
	}
	if (supportsSync && script.src && !hasAttribute(script, 'async')) script.async = false;
	script.type = "text/javascript";
	
	// enabledFu resolves after script is inserted
	var enabledRe, enabledFu = new Promise(function(resolve, reject) { enabledRe = { resolve: resolve, reject: reject }; }); 
	
	var prev = queue[queue.length - 1], prevScript = prev && prev.script;

	var triggerFu; // triggerFu allows this script to be enabled, i.e. inserted
	if (prev) {
		if (hasAttribute(prevScript, 'async') || supportsSync && !hasAttribute(script, 'async')) triggerFu = prev.enabled;
		else triggerFu = prev.complete; 
	}
	else triggerFu = Promise.resolve();
	
	triggerFu.then(enable, enable);

	var current = { script: script, complete: completeFu, enabled: enabledFu };
	queue.push(current);
	return completeFu;

	// The following are hoisted
	function enable() {
		preloadedFu.then(_enable, function(err) { logger.error('Script preloading failed'); });
	}
	function _enable() {
		replaceNode(node, script);
		enabledRe.resolve(); 
		if (!script.src) {
			remove(queue, current);
			completeRe.resolve();
		}
	}
	
	function onLoad(e) {
		removeListeners();
		remove(queue, current);
		completeRe.resolve();
	}

	function onError(e) {
		removeListeners();
		remove(queue, current);
		completeRe.reject('NetworkError'); // FIXME throw DOMError()
	}

	function addListeners() {
		if (supportsOnLoad) {
			addEvent(script, "load", onLoad);
			addEvent(script, "error", onError);
		}
		else addEvent(script, 'readystatechange', onChange);
	}
	
	function removeListeners() {
		if (supportsOnLoad) {
			removeEvent(script, "load", onLoad);
			removeEvent(script, "error", onError);
		}
		else removeEvent(script, 'readystatechange', onChange);
	}
	
	function onChange(e) { // for IE <= 8 which don't support script.onload
		var readyState = script.readyState;
		if (!script.parentNode) {
			if (readyState === 'loaded') preloadedRe.resolve(); 
			return;
		}
		switch (readyState) {
		case "complete":
			onLoad(e);
			break;
		case "loading":
			onError(e);
			break;
		default: break;
		}	
	}

}

this.empty = function() {
return new Promise(function(resolve, reject) {
	
	emptying = true;
	if (queue.length <= 0) {
		emptying = false;
		resolve();
		return;
	}
	forEach(queue, function(value, i) {
		var acceptCallback = function() {
			if (queue.length <= 0) {
				emptying = false;
				resolve();
			}
		}
		value.complete.then(acceptCallback, acceptCallback);
	});

});
}

} // end scriptQueue

function getDecorMarker(doc) {
	if (!doc) doc = document;
	var marker = firstChild(doc.head, function(el) {
		return el.nodeType == 1 &&
			tagName(el) == "link" &&
			/\bMEEKO-DECOR-ACTIVE\b/i.test(el.rel);
	});
	return marker;
}

function getSelfMarker(doc) {
	if (!doc) doc = document;
	var marker = firstChild(doc.head, function(el) {
		return el.nodeType == 1 &&
			tagName(el) == "link" &&
			/\bMEEKO-SELF\b/i.test(el.rel);
	});
	return marker;
}

// end decor defn

}).call(window);
