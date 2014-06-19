(function() {

var logger = Meeko.logger;
var _ = Meeko.stuff;
var DOM = Meeko.DOM, $id = DOM.$id, $$ = DOM.$$;
var URL = Meeko.URL, baseURL = URL(document.URL);
function toArray(list) { var a = []; for (var n=list.length, i=0; i<n; i++) a[i] = list[i]; return a; }

Meeko.decor.config({
	/*
	You SHOULD REMOVE the `detect(doc)` option and
	REPLACE IT WITH a `lookup(url)` option:
	
		lookup: function(url) { return decorURL; }
		
	The decorURL can be dependent on anything, for-instance
	+ device / window dimensions
		- to provide optimal layout
	+ browser
		- to give minimal support to old browsers
	+ a theme setting from cookie or localStorage
		- allows you to test a decor-document on the live site
	 */
	
	detect: function(doc) { return getDecorURL(doc); }
});

Meeko.panner.config({
	normalize: function(doc, details) { // details contains the request `url` and `method`
		
		// This removes fallback <style> and <link>, determined by their @title
		var nodecorTitle = 'nodecor'; // This is the (case-insensitive) value for the fallback @title
		var srcHead = doc.head;
		_.forEach(toArray(srcHead.childNodes), function(node) { // remove nodes that match specified conditions
			switch(DOM.tagName(node)) { 
			case "style": case "link":
				var title = _.lc(_.trim(node.title));
				if (title != nodecorTitle) return;
				break;
			default: return;
			}
			srcHead.removeChild(node);
		});
		
		// YOUR NORMALIZE CODE GOES HERE
	},
	
	// These SHOULD be set by your decor-document(s). This is just for backwards compat
	duration: 0,
	nodeRemoved: { before: hide, after: show },
	nodeInserted: { before: hide, after: show },
	pageOut: { before: noop, after: noop },
	pageIn: { before: noop, after: noop }
});

function getDecorURL(doc) {
	var link = getDecorLink(doc);
	if (!link) return null; // FIXME warning message
	var href = link.getAttribute("href");
	return baseURL.resolve(href); // FIXME href should already be absolute
}

function getDecorLink(doc) {
	var matchingLinks = [];
	var link, specificity = 0;
	_.forEach($$("link", doc.head), function(el) {
		var tmp, sp = 0;
		if (el.nodeType != 1) return;
		var type = el.type.toLowerCase();
		if (!/^\s*MEEKO-DECOR\s*$/i.test(el.rel)) return;
		if (type == "text/html" || type == "") sp += 1;
		else {
			logger.warn("Invalid decor document type: " + type);
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

function hide(msg) { msg.node.setAttribute("hidden", "hidden"); }
function show(msg) { msg.node.removeAttribute("hidden"); }
function noop(msg) { }

})();
