/*!
 * Copyright 2012-2013 Sean Hogan (http://meekostuff.net/)
 * Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
 */

(function() {

var defaults = { // NOTE defaults also define the type of the associated config option
	"no_boot": false, // WARN don't remove or change this line, otherwise no_boot when reloading after capture error won't be detected - infinite reload
	"autostart": true,
	"capturing": false,
	"log_level": "warn",
	"hidden_timeout": 3000,
	"polling_interval": 50,
	"html5_block_elements": 'article aside figcaption figure footer header hgroup main nav section',
	"html5_inline_elements": 'abbr mark output time',
	"htmldecor_script": '{bootscriptdir}HTMLDecor.js',
	"config_script": '{bootscriptdir}config.js'
}

var vendorPrefix = "Meeko";

var Meeko = window.Meeko || (window.Meeko = {});

// TODO up-front feature testing to prevent boot on unsupportable platorms
// e.g. where script.onload can't be used or faked

/*
 ### JS utilities
 */
var document = window.document;

function each(object, fn, context) { // WARN doesn't check hasOwnProperty()
	for (slot in object) fn.call(context, slot, object[slot], object);
}

function some(a, fn, context) { 
	for (var n=a.length, i=0; i<n; i++) if (fn.call(context, a[i], i, a)) return true;
	return false;
}
var forEach = some; // WARN some() is forEach() ONLY IF fn() always returns falsish (including nothing)

function words(text) { return text.split(/\s+/); }

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
 ### Get options

 TODO It would be nice if all data sources had the same API
*/

Meeko.cookieStorage = { // TODO should be under Meeko.DOM

getItem: function(sKey) { // See https://developer.mozilla.org/en-US/docs/DOM/Storage
	  return unescape(document.cookie.replace(new RegExp("(?:^|.*;\\s*)" + escape(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*((?:[^;](?!;))*[^;]?).*"), "$1")); // TODO decodeURIComponent??
}

}

var reloadOptions = Meeko.reloadOptions = window.sessionStorage && (function() {

var optionsKey = 'Meeko.reloadOptions';
var text = sessionStorage.getItem(optionsKey);
sessionStorage.removeItem(optionsKey);
var options = parseJSON(text);
if (typeof options !== 'object' || options === null) options = {};
var saveOptions = {};

return {

getItem: function(key) {
	return options[key];
},

setItem: function(key, name) {
	saveOptions[key] = name;
},

save: function() {
	sessionStorage.setItem(optionsKey, JSON.stringify(saveOptions));
}

}

})();

var dataSources = [];

function addDataSource(name, key) {
	if (!key) key = vendorPrefix + '.options';
	try { // NOTE IE10 can throw on `localStorage.getItem()` - see http://stackoverflow.com/questions/13102116/access-denied-for-localstorage-in-ie10
		// Also Firefox on `window.localStorage` - see http://meyerweb.com/eric/thoughts/2012/04/25/firefox-failing-localstorage/
		var source = window[name] || Meeko[name];
		if (!source) return;
		var options = parseJSON(source.getItem(key));
		if (options) dataSources.push( function(name) { return options[name] } );
	} catch(error) {
		logger.warn(name + ' inaccessible');
	}
}

if (reloadOptions) dataSources.push( function(name) { return reloadOptions.getItem(name); } );
addDataSource('sessionStorage');
if (!Meeko.options || !Meeko.options['ignore_cookie_options']) addDataSource('cookieStorage');
addDataSource('localStorage');
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

if (no_boot()) return;

function no_boot() {

	// Don't even load HTMLDecor if "nodecor" / "noboot" is one of the search options (or true in Meeko.options)
	if (/(^\?|&)(no_?decor|no_?boot)($|&)/.test(location.search)) return true;
	if (bootOptions['no_boot']) return true;
	
}


/*
 ### DOM utilities
 */

function $$(selector, context) { context = context || document; return context.getElementsByTagName(selector); }

document.head = $$('head')[0]; // FIXME should abort if there is no <head>

function toStartTag(el) { // WARN outerHTML not available before Firefox 11
	return el.outerHTML.replace(/>.*$/, '>\n');
}

function getDocTypeTag(doc) { // WARN doctype not available before IE 9
	var doctype = doc.doctype;
	return (doctype) ?

		'<!DOCTYPE ' + doctype.name +
		(doctype.publicId ? 'PUBLIC "' + doctype.publicId + '"': '') +
		(doctype.systemId ? '"' + doctype.systemId + '"' : '') +
		'>\n' :

		'<!DOCTYPE html>\n';
}

function getBootScript() {
	var script = document.currentScript;
	if (script) return script;
	/*
	WARN this assumes boot-script is the last in the document 
	This is guaranteed for the normal usage of:
	- the boot-script is in the markup of the document
	- the page is loaded normally
	- the script DOES NOT have @async or @defer
	In other cases - dynamic-insertion, document.write into an iframe -
	the inserting code must ensure the script is last in document.
	*/
	var allScripts = $$('script');
	script = allScripts[allScripts.length - 1];
	return script;
}

function resolveURL(url, params) { // works for all browsers including IE < 8
	if (url.substr(0,2) == '//') url = location.protocol + url;
	for (var name in params) {
		url = url.replace('{' + name + '}', params[name]); // WARN max of one reolace per param
	}
	var div = document.createElement('div');
	div.innerHTML = '<a href="' + url + '"></a>';
	return div.firstChild.href;
}

var addEvent = 
	document.addEventListener && function(node, event, fn) { return node.addEventListener(event, fn, false); } ||
	document.attachEvent && function(node, event, fn) { return node.attachEvent("on" + event, fn); } ||
	function(node, event, fn) { node["on" + event] = fn; };

var removeEvent = 
	document.removeEventListener && function(node, event, fn) { return node.removeEventListener(event, fn, false); } ||
	document.detachEvent && function(node, event, fn) { try { return node.detachEvent("on" + event, fn); } catch(error) {} } ||
	function(node, event, fn) { if (node["on" + event] == fn) node["on" + event] = null; };

var domReady = (function() {
// WARN this function assumes the script is included in the page markup so it will run before DOMContentLoaded, etc

var loaded = false;
var queue = [];

function domReady(fn) {
	queue.push(fn);
	if (loaded) processQueue();
}

function processQueue() {
	forEach(queue, function(fn) { setTimeout(fn); });
	queue.length = 0;
}

var events = {
	'readystatechange': document,
	'DOMContentLoaded': document,
	'load': window
}

addListeners(events, onChange);

function onChange(e) {
	switch(e.type) {
	case "DOMContentLoaded": case "load": 
		loaded = true;
		break;
	case "readystatechange":
		if (/loaded|complete/.test(document.readyState)) loaded = true;
		break;
	}
	if (!loaded) return;
	removeListeners(events, onChange);
	processQueue();
}

function addListeners(events, handler) {
	each(events, function(type, node) { addEvent(node, type, handler); });
}

function removeListeners(node, types, handler) {
	each(events, function(type, node) { removeEvent(node, type, handler); });
}

return domReady;

})();


/*
 ### async functions
 */

var queue = (function() {

var head = document.head;
var marker = head.firstChild;
var testScript = document.createElement('script');
var supportsOnLoad = (testScript.setAttribute('onload', ';'), typeof testScript.onload === 'function');
var supportsSync = (testScript.async === true);

if (!supportsOnLoad && !testScript.readyState) throw "script.onload not supported in this browser";

function prepareScript(url, onload, onerror) { // create script (and insert if supportsSync)
	var script = document.createElement('script');
	script.onerror = onError;
	script.onload = onLoad;
	script.src = url;
	if (supportsSync) {
		script.async = false;
		marker.parentNode.insertBefore(script, marker);
	}
	return script;

	// The following are hoisted
	function onLoad() {
		script.onerror = null;
		script.onload = null;
		onload();
	}
	
	function onError() { 
		script.onerror = null;
		script.onload = null;
		onerror();
	}	
}

function enableScript(script) { // insert script (if not already done). Insertion is delayed if preloading
	// TODO assert (!!script.parentNode === supportsSync)
	if (supportsSync) return;

	if (supportsOnLoad) {
		marker.parentNode.insertBefore(script, marker);
		return;
	}

	/*
		IE <= 8 don't implement script.onload, script.onerror.
		But they do implement script preloading:
			http://wiki.whatwg.org/wiki/Dynamic_Script_Execution_Order#readyState_.22preloading.22
		Preloading starts as soon as `script.src` is set.
		If the script isn't inserted then it completes when `script.readyState === 'loaded'`.
		If the script is then inserted the readyState signals success as 'complete' and failure as 'loading'.
	*/
	script.onreadystatechange = onChange;
	if (script.readyState == 'loaded') onChange();

	function onChange() {
		var readyState = script.readyState;
		if (!script.parentNode) {
			if (readyState === 'loaded') marker.parentNode.insertBefore(script, marker);
			return;
		}
		switch (readyState) {
		case "complete": // NOTE successfully loaded
			script.onreadystatechange = null;
			script.onload();
			break;
		case "loading": // NOTE load failure
			script.onreadystatechange = null;
			script.onerror();
			break;
		default: break;
		}
	}

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

	function errorback() {
		var fn;
		while (fn = list.shift()) {
			if (typeof fn == 'function') continue;
			// NOTE the only other option is a prepared script
			disableScript(fn);
		}
		if (onerror) onerror();
	}

	function queueback() {
		var fn;
		while (list.length) {
			fn = list.shift();
			if (typeof fn == "function") {
				try { fn(); continue; }
				catch(err) {
					setTimeout(function() { throw err; });
					errorback();
					return;
				}
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
 ### plugin functions for HTMLDecor
 */
var html5prepare = (function() {

var blockTags = words(bootOptions['html5_block_elements']);
var inlineTags = words(bootOptions['html5_inline_elements']);

function addStyles() {
	if (blockTags.length <= 0) return; // FIXME add a test for html5 support. TODO what about inline tags?

	var head = document.head;
	var fragment = document.createDocumentFragment();
	var style = document.createElement("style");
	fragment.appendChild(style); // NOTE on IE this realizes style.styleSheet 
	
	var cssText = blockTags.join(', ') + ' { display: block; }\n';
	if (style.styleSheet) style.styleSheet.cssText = cssText;
	else style.textContent = cssText;
	
	head.insertBefore(style, head.firstChild);
}

function html5prepare(doc) {
	if (!doc) {
		doc = document;
		addStyles();
	}
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

var head = document.head;
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
	setTimeout(function() { document.body.style.visibility = ""; }, pollingInterval);
}

return {
	hide: hide,
	unhide: unhide
}

})();

/*
 ## Boot configuration
*/

var bootScript;
if (Meeko.bootScript) bootScript = Meeko.bootScript; // hook for meeko-panner
else {
	bootScript = Meeko.bootScript = getBootScript();
	if (document.body) logger.warn("Boot-script SHOULD be in <head> and MUST NOT have @async or @defer");
}


var urlParams = Meeko.bootParams = { // WARN this dictionary can be modified during the boot sequence
	bootscriptdir: bootScript.src.replace(/\/[^\/]*$/, '/') // TODO this assumes no ?search or #hash
}

if (Meeko.bootConfig) Meeko.bootConfig(); // TODO try / catch ??

/*
 ## Startup
*/

var capturing = false, capturedHTML = '';

// FIXME Capturing conflicts with autostart: false and document already loaded
// FIXME needs dead man recovery with document.write(), but this breaks older IE
// FIXME alternatively could turn off booting in sessionStorage and then use document.reload()
if (bootOptions['capturing']) {
	if (!reloadOptions) throw 'Capturing depends on sessionStorage and JSON'; 
	if (document.body) throw 'When capturing, boot-script MUST be in - or before - <head>';
	if (!bootOptions['autostart']) throw 'Capturing is not compatible with autostart: false';
	if ($$('script').length > 1) throw 'When capturing, boot-script MUST be first <script>';
	if (some($$('*', document.head), function(node) { // return true if invalid node
		if (node.nodeType !== 1) return false; // comments and text-nodes are ok
		if (node === bootScript) return false; // boot-script is ok. TODO should be last node in <head>
		if (node.tagName === 'TITLE' && node.firstChild === null) return false; // IE6 adds a dummy <title>
		if (node.tagName !== 'META') return true; 
		if (node.httpEquiv) return false; // <meta http-equiv> are ok
		return true;
	})) throw 'When capturing, only <meta http-equiv> nodes may precede boot-script';
	capturing = true;
	capturedHTML += getDocTypeTag(document); // WARN relies on document.doctype
	capturedHTML += toStartTag(document.documentElement); // WARN relies on element.outerHTML
	capturedHTML += toStartTag(document.head);
	document.write('<plaintext style="display: none;">');
}


var timeout = bootOptions["hidden_timeout"];
if (timeout > 0) {
	Viewport.hide();
	setTimeout(Viewport.unhide, timeout);
}

var log_index = logger.levels[bootOptions["log_level"]];
if (log_index != null) logger.LOG_LEVEL = log_index;

html5prepare(); // no doc arg means use document and add block element styles

/*
	The self-marker is inserted by HTMLDecor (if not already present)
	to mark the head elements associated with the content document
	as opposed to decor elements or others.
	The boot-script inserts one which means <style>, etc inserted above
	are protected from HTMLDecor
*/
   
var selfMarker = document.createElement('link');
selfMarker.rel = 'meeko-self';
selfMarker.href = document.URL;
document.head.insertBefore(selfMarker, bootScript.parentNode === document.head ? bootScript : document.head.firstChild);


function config() {
	Meeko.DOM.ready = domReady;
	Meeko.DOM.HTMLParser.prototype.prepare = html5prepare;
	Meeko.Future.pollingInterval = bootOptions["polling_interval"];
	Meeko.decor.config({
		decorReady: Viewport.unhide
	});
}

function start() {
	if (!bootOptions["autostart"]) {
		Viewport.unhide();
		return;
	}
	var startOptions = {};

	if (capturing) {
		var loader = new Meeko.DOM.HTMLLoader({
			request: function() {
				return new Meeko.Future(function() { var r = this;
					domReady(function() {
						var elts = $$('plaintext');
						var plaintext = elts[elts.length - 1]; // NOTE There should only be one, but take the last just to be sure
						var html = plaintext.firstChild.nodeValue;
						plaintext.parentNode.removeChild(plaintext);
						
						if (!/\s*<!DOCTYPE/i.test(html)) html = capturedHTML + html;
						var doc = Meeko.DOM.parseHTML(new String(html), document.URL);
						r.accept(doc);
					});
				});
			}
		});
		startOptions.contentDocument = loader.load();
	}

	Meeko.decor.start(startOptions);
}

function resolveScript(script) {
	switch (typeof script) {
	case "string": return resolveURL(script, urlParams);
	case "function": return script;
	default: return function() { /* dummy */ };
	}
}

var htmldecor_script = bootOptions['htmldecor_script'];
if (typeof htmldecor_script !== 'string') throw 'HTMLDecor script URL is not configured';
htmldecor_script = bootOptions['htmldecor_script'] = resolveURL(htmldecor_script, urlParams);

var config_script = bootOptions['config_script'];
if (config_script instanceof Array) forEach(config_script, function(script, i, list) {
	list[i] = resolveScript(script, urlParams);
});
else {
	config_script = [ resolveScript(config_script) ];
	bootOptions['config_script'] = config_script;
}

var startupSequence = [].concat(
	htmldecor_script,
	config,
	config_script,
	start
);

queue(startupSequence, null, function() {
	if (capturing) 	domReady(function() {
		reloadOptions.setItem('no_boot', true);
		reloadOptions.save();
		location.reload();
	});
	else Viewport.unhide();
});

})();
