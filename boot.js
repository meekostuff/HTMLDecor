/*!
 * Copyright 2012-2013 Sean Hogan (http://meekostuff.net/)
 * Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
 */

(function() {

var defaults = { // NOTE defaults also define the type of the associated config option
	"htmldecor-script": '{bootscriptdir}HTMLDecor.js',
	"log-level": "warn",
	"decor-autostart": true,
	"decor-theme": "",
	"decor-hidden-timeout": 3000,
	"polling-interval": 50
}

// Don't even load HTMLDecor if "nodecor" is one of the search options
if (/(^\?|&)nodecor($|&)/.test(location.search)) return;

var vendorPrefix = "meeko";

var Meeko = window.Meeko || (window.Meeko = {});

/*
 ### Utility functions
 */

function $$(selector) { return document.getElementsByTagName(selector); }

function getCurrentScript() { // TODO this won't work if script is dynamically inserted (or async / defer)
	var allScripts = $$('script');
	var script = allScripts[allScripts.length - 1];
	return script;
}

var uc = function(str) { return str.toUpperCase(); }
var lc = function(str) { return str.toLowerCase(); }

var some = function(a, fn, context) { // some() is forEach() if fn() always returns falsish
	for (var n=a.length, i=0; i<n; i++) {
		if (fn.call(context, a[i], i, a)) return true; 
	}
	return false;
}

var words = function(text) { return text.split(/\s+/); }

var parseJSON = (window.JSON && JSON.parse) ?
function(text) {
	try { return JSON.parse(text); }
	catch (error) { return; }
} :
function(text) {
	try { return ( Function('return ( ' + text + ' );') )(); }
	catch (error) { return; }
}

var loadScript = (function() {

var head = $$("head")[0]; // TODO is there always a <head>?
var marker = head.firstChild;

function loadScript(url, onload, onerror) {
	var script = document.createElement('script');
	script.onerror = onerror;
	var loaded = false;
	if (script.readyState) script.onreadystatechange = function() {
		if (loaded) return;
		if (script.readyState != "loaded" && script.readyState != "complete") return;
		loaded = true;
		onload();
	}
	else script.onload = onload;
	script.src = url;
	marker.parentNode.insertBefore(script, marker);
}

return loadScript;

})();

function resolveURL(url) { // works for all browsers including IE < 8
	var div = document.createElement('div');
	div.innerHTML = '<a href="' + url + '"></a>';
	return div.firstChild.href;
}

function queue(fnList, oncomplete, onerror) {
	var list = [].concat(fnList);
	var queueback = function() {
		var fn = list.shift();
		if (fn) fn(queueback, onerror);
		else if (oncomplete) oncomplete();
	}
	queueback();
}

function delay(callback, timeout) {
	return window.setTimeout(callback, timeout);
}

var logger = Meeko.logger || (Meeko.logger = new function() {

var levels = this.levels = words("none error warn info debug");

some(levels, function(name, num) {

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

this.LOG_LEVEL = levels.warn; // DEFAULT

}); // end logger defn

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
	if (style.parentNode != head) return;
	head.removeChild(style);
	// NOTE on IE sometimes content stays hidden although 
	// the stylesheet has been removed.
	// The following forces the content to be revealed
	document.body.style.visibility = "hidden";
	delay(function() { document.body.style.visibility = ""; });
}

return {
	hide: hide,
	unhide: unhide
}

})();

/*
 ### Get options
*/

var dataSources = [];

var urlParams = (function() {
	var search = location.search,
		options = {}; 
	if (search) search.substr(1).replace(/(?:^|&)([^&=]+)=?([^&]*)/g, function(m, key, val) { if (m) options[key] = decodeURIComponent(val); });
	return options;
})();

var urlOptions = parseJSON(urlParams[vendorPrefix+'-options']);
if (urlOptions) dataSources.push( function(name) { return urlOptions[name]; } );

try { // NOTE initial testing on IE10 showed attempting to get localStorage throws an access error
	if (window.sessionStorage) {
		var sessionOptions = parseJSON(sessionStorage.getItem(vendorPrefix + "-options"));
		if (sessionOptions) dataSources.push( function(name) { return sessionOptions[name]; } );
	}
	if (window.localStorage) {
		var localOptions = parseJSON(localStorage.getItem(vendorPrefix + "-options"));
		if (localOptions) dataSources.push( function(name) { return localOptions[name]; } );
	}
} catch(error) {}

if (Meeko.options) dataSources.push( function(name) { return Meeko.options[name]; } )

var getData = function(name, type) {
	var data = null;
	some(dataSources, function(fn) {
		var val = fn(name);
		if (val === null) return false;
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
		return (data !== null); 
	});
	return data;
}

var globalOptions = (function() {
	var options = {};
	for (var name in defaults) {
		var def = options[name] = defaults[name];
		var val = getData(name, typeof def);
		if (val != null) options[name] = val;
	}
	return options;
})();


function getDecorURL(doc) {
	var link = getDecorLink(doc);
	if (!link) return null; // FIXME warning message
	var href = link.getAttribute("href");
	return resolveURL(href); // FIXME href should already be absolute
}

function getDecorLink(doc) {
	var matchingLinks = [];
	var link, specificity = 0;
	some($$("link", doc.head), function(el) {
		var tmp, sp = 0;
		if (el.nodeType != 1) return;
		var type = lc(el.type);
		if (!/^\s*MEEKO-DECOR\s*$/i.test(el.rel)) return;
		if (type == "text/html" || type == "") sp += 1;
		else {
			logger.error("Invalid decor document type: " + type);
			return;
		}
		if (tmp = el.getAttribute("media")) { // FIXME polyfill for matchMedia??
			if (window.matchMedia && window.matchMedia(tmp).matches) sp += 2;
			else return; // NOTE if the platform doesn't support media queries then this decor is rejected
		}
		if (sp > specificity) {
			specificity = sp;
			link = el;
		}
	});
	return link;
}

/* now do start-up */

var timeout = globalOptions["decor-hidden-timeout"];
if (timeout > 0) {
	Viewport.hide();
	delay(Viewport.unhide, timeout);
}

var log_index = logger.levels[globalOptions["log-level"]];
if (log_index != null) logger.LOG_LEVEL = log_index;

var start = function() {
	var async = Meeko.async;
	async.pollingInterval = globalOptions["polling-interval"];
	var decor = Meeko.decor;
	decor.config({
		decorReady: Viewport.unhide,
		detect: getDecorURL
	});
	decor["theme"] = globalOptions["decor-theme"];
	if (globalOptions["decor-autostart"]) decor.start();
	else Viewport.unhide();
}

var bootscriptdir = getCurrentScript().src.replace(/\/[^\/]*$/, '/');
var htmldecor_script = globalOptions['htmldecor-script'].replace('{bootscriptdir}', bootscriptdir);

loadScript(htmldecor_script, start, Viewport.unhide);
//	loadScript('/config.js', oncomplete, oncomplete);

})();
