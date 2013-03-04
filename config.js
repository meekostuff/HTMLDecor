(function() {

var logger = Meeko.logger;
var _ = Meeko.stuff;
var DOM = Meeko.DOM, $id = DOM.$id, $$ = DOM.$$;
var URL = DOM.URL, baseURL = URL(document.URL);

Meeko.decor.config({
	detect: function(doc) { return getDecorURL(doc); }
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

})();
