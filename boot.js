/*!
 * Copyright 2012-2013 Sean Hogan (http://meekostuff.net/)
 * Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
 */

(function() {

var defaults = { // NOTE defaults also define the type of the associated config option
	"htmldecor_script": '{bootscriptdir}HTMLDecor.js',
	"log_level": "warn",
	"autostart": true,
	"hidden_timeout": 3000,
	"polling_interval": 50,
	"html5_block_elements": 'article aside figcaption figure footer header hgroup main nav section',
	"html5_inline_elements": 'abbr mark',
	"config_script": '{bootscriptdir}config.js'
}

// Don't even load HTMLDecor if "nodecor" is one of the search options
if (/(^\?|&)nodecor($|&)/.test(location.search)) return;

var document = window.document;

var vendorPrefix = "Meeko";

var Meeko = window.Meeko || (window.Meeko = {});

/*
 ### JS utilities
 */
var some = function(a, fn, context) { 
	for (var n=a.length, i=0; i<n; i++) {
		if (fn.call(context, a[i], i, a)) return true; 
	}
	return false;
}
var forEach = some; // some() is forEach() if fn() always returns falsish

var words = function(text) { return text.split(/\s+/); }

var parseJSON = function(text) { // NOTE this allows code to run. This is a feature, not a bug. I think.
	try { return ( Function('return ( ' + text + ' );') )(); }
	catch (error) { return; }
}


/*
 ### logger defn and init
 */
var logger = Meeko.logger || (Meeko.logger = new function() {

var levels = this.levels = words("none error warn info debug");

forEach(levels, function(name, num) {

levels[name] = num;
this[name] = function() { this._log({ level: num, message: arguments }); }

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

this.LOG_LEVEL = levels[defaults['log_level']]; // DEFAULT. Options are read later

}); // end logger defn

/*
 ### DOM utilities
 */

function $$(selector) { return document.getElementsByTagName(selector); }

function getCurrentScript() { // TODO this won't work if script is dynamically inserted (or async / defer)
	var allScripts = $$('script');
	var script = allScripts[allScripts.length - 1];
	return script;
}

function resolveURL(url, params) { // works for all browsers including IE < 8
	for (var name in params) {
		url = url.replace('{' + name + '}', params[name]); // WARN max of one reolace per param
	}
	var div = document.createElement('div');
	div.innerHTML = '<a href="' + url + '"></a>';
	return div.firstChild.href;
}

var addEvent = 
	document.addEventListener && function(node, event, fn) { return node.addEventListener(event, fn, true); } || // NOTE using capture phase
	document.attachEvent && function(node, event, fn) { return node.attachEvent("on" + event, fn); } ||
	function(node, event, fn) { node["on" + event] = fn; }

var isContentLoaded = (function() { // TODO perhaps remove listeners after load detected
// WARN this function assumes the script is included in the page markup so it will run before DOMContentLoaded, etc

var loaded = false;
function onLoaded(e) {
	if (e.target == document) loaded = true;
	if (document.readyState == "complete") loaded = true;
}
function onChange(e) {
	var readyState = document.readyState;
	if (readyState == "loaded" || readyState == "complete") loaded = true;
}

addEvent(document, "readystatechange", onChange); 
addEvent(document, "DOMContentLoaded", onLoaded);
addEvent(document, "load", onLoaded);

var isContentLoaded = function() {
	return loaded;
}

return isContentLoaded;

})();

/*
 ### async functions
 */

function delay(callback, timeout) {
	return window.setTimeout(callback, timeout);
}

var queue = (function() {

var head = $$("head")[0]; // TODO is there always a <head>?
var marker = head.firstChild;

function prepareScript(url, onload, onerror) {
	var script = document.createElement('script');
	script.onerror = onerror;
	var loaded = false;
	if (script.readyState) script.onreadystatechange = function() {
		if (loaded) return;
		if (!script.parentNode) return; // onreadystatechange will always fire after insertion, but can fire before which messes up the queue
		if (script.readyState != "loaded" && script.readyState != "complete") return;
		loaded = true;
		onload();
	}
	else script.onload = onload;
	script.src = url;
	
	if (script.async == true) {
		script.async = false;
		marker.parentNode.insertBefore(script, marker);
	}
	return script;
}

function enableScript(script) {
	if (script.parentNode) return;
	marker.parentNode.insertBefore(script, marker);
}

function disableScript(script) {
	if (!script.parentNode) return;
	script.parentNode.removeChild(script);
}

function queue(fnList, oncomplete, onerror) {
	var list = [];
	forEach(fnList, function(fn) {
		switch(typeof fn) {
		case "string":
			list.push(prepareScript(fn, queueback, errorback));
			break;
		case "function":
			list.push(fn);
			break;
		default: // TODO
			break;
		}
	});
	queueback();

	function errorback(err) {
		logger.error(err);
		var fn;
		while (fn = list.shift()) {
			if (typeof fn == 'function') continue;
			// NOTE the only other option is a prepared script
			disableScript(fn);
		}
		if (onerror) onerror(err);
	}

	function queueback() {
		var fn;
		while (fn = list.shift()) {
			if (typeof fn == "function") {
				try { fn(); continue; }
				catch(err) { errorback(err); return; }
			}
			else { // NOTE the only other option is a prepared script
				enableScript(fn);
				return;
			}
		}
		if (oncomplete) oncomplete();
		return;
	}
}

return queue;

})();

/*
 ### Get options
*/

var dataSources = [];

try {
	if (window.sessionStorage) {
		var sessionOptions = parseJSON(sessionStorage.getItem(vendorPrefix + ".options"));
		if (sessionOptions) dataSources.push( function(name) { return sessionOptions[name]; } );
	}
} catch(error) {
	logger.warn('sessionStorage defined but inaccessible');
}
try {
    function getCookieItem(sKey) { // See https://developer.mozilla.org/en-US/docs/DOM/Storage
      return unescape(document.cookie.replace(new RegExp("(?:^|.*;\\s*)" + escape(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*((?:[^;](?!;))*[^;]?).*"), "$1")); // TODO decodeURIComponent??
    }
	var cookieOptions = parseJSON(getCookieItem(vendorPrefix + ".options"));
	if (cookieOptions) dataSources.push( function(name) { return cookieOptions[name]; } );
} catch(error) {
	logger.warn('cookies inaccessible');
}
try { // NOTE initial testing on IE10 showed attempting to get localStorage throws an access error
	if (window.localStorage) {
		var localOptions = parseJSON(localStorage.getItem(vendorPrefix + ".options"));
		if (localOptions) dataSources.push( function(name) { return localOptions[name]; } );
	}
} catch(error) {
	logger.warn('localStorage defined but inaccessible');	
}

if (Meeko.options) dataSources.push( function(name) { return Meeko.options[name]; } )

var getData = function(name, type) {
	var data = null;
	some(dataSources, function(fn) {
		var val = fn(name);
		if (val == null) return false;
		switch (type) {
		case "string": data = val; break;
		case "number":
			if (!isNaN(val)) data = 1 * val;
			// TODO else logger.warn("incorrect config option " + val + " for " + name); 
			break;
		case "boolean":
			data = !!val;
			// if ([false, true, 0, 1].indexOf(val) < 0) logger.warn("incorrect config option " + val + " for " + name); 
			break;
		}
		return (data !== null); 
	});
	return data;
}

var bootOptions = Meeko.bootOptions = (function() {
	var options = {};
	for (var name in defaults) {
		var def = options[name] = defaults[name];
		var val = getData(name, typeof def);
		if (val != null) options[name] = val;
	}
	return options;
})();

/*
 ### plugin functions for HTMLDecor
 */
var html5prepare = (function() {

var blockTags = words(bootOptions['html5_block_elements']);
var inlineTags = words(bootOptions['html5_inline_elements']);

if (blockTags.length) { // FIXME add a test for html5 support. TODO what about inline tags?

var head = $$("head")[0];
var fragment = document.createDocumentFragment();
var style = document.createElement("style");
fragment.appendChild(style); // NOTE on IE this realizes style.styleSheet 

var cssText = blockTags.join(', ') + ' { display: block; }\n';
if (style.styleSheet) style.styleSheet.cssText = cssText;
else style.textContent = cssText;

head.insertBefore(style, head.firstChild);
	
}

function html5prepare(doc) {
	if (!doc) doc = document;
	forEach(blockTags.concat(inlineTags), function(tag) {
		doc.createElement(tag);
	});	
}

return html5prepare;

})();

/*
 ### Viewport hide / unhide
 */
var Viewport = (function() {

var head = $$("head")[0];
var fragment = document.createDocumentFragment();
var style = document.createElement("style");
fragment.appendChild(style); // NOTE on IE this realizes style.styleSheet 

// NOTE hide the page until the decor is ready
if (style.styleSheet) style.styleSheet.cssText = "body { visibility: hidden; }";
else style.textContent = "body { visibility: hidden; }";

function hide() {
	head.insertBefore(style, head.firstChild);
}

function unhide() {
	var pollingInterval = bootOptions['polling_interval'];
	if (style.parentNode != head) return;
	head.removeChild(style);
	// NOTE on IE sometimes content stays hidden although 
	// the stylesheet has been removed.
	// The following forces the content to be revealed
	document.body.style.visibility = "hidden";
	delay(function() { document.body.style.visibility = ""; }, pollingInterval);
}

return {
	hide: hide,
	unhide: unhide
}

})();

/*
 ## Startup
*/

var log_index = logger.levels[bootOptions["log_level"]];
if (log_index != null) logger.LOG_LEVEL = log_index;

html5prepare(document);

var timeout = bootOptions["hidden_timeout"];
if (timeout > 0) {
	Viewport.hide();
	delay(Viewport.unhide, timeout);
}

var config = function() {
	Meeko.DOM.isContentLoaded = isContentLoaded;
	Meeko.DOM.HTMLParser.prototype.prepare = html5prepare;
	Meeko.async.pollingInterval = bootOptions["polling_interval"];
	Meeko.decor.config({
		decorReady: Viewport.unhide
	});
}

var start = function() {
	if (bootOptions["autostart"]) Meeko.decor.start();
	else Viewport.unhide();
}

var urlParams = {
	bootscriptdir: getCurrentScript().src.replace(/\/[^\/]*$/, '/')
}
var htmldecor_script = bootOptions['htmldecor_script'];
if (!htmldecor_script) throw "HTMLDecor script URL is not configured";
htmldecor_script = resolveURL(htmldecor_script, urlParams);
var config_script = bootOptions['config_script'];
if (config_script && typeof config_script == 'string') config_script = resolveURL(config_script, urlParams);

queue([
htmldecor_script,
config,
config_script || function() {},
start
], null, Viewport.unhide);

})();
