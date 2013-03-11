HTMLDecor
=========

> HTMLDecor means **full** separation of content from presentation.
> With CSS you can change the styling of a whole site with one stylesheet.
> With HTMLDecor you can change everything -
> banner, navbars, ads, page-layout and stylesheets.
> Not only is it simple to setup and maintain, 
> you'll cut the download time of every page,
> plus "pushState assisted navigation" comes for free.

HTMLDecor is a Javascript page decoration engine which runs in the browser.
It allows your site to deliver real page content first (and fast).
Your site decor can be placed in its own page and merged in the browser instead of on the server. 

A site decor page is similar to an external stylesheet in that it can be shared between several pages.
Originally it was even referenced with a resource link, just like stylesheets:

    <link rel="meeko-decor" type="text/html" href="decor.html" />

<small>**(This referencing method has been superceded by external configuration, which is less limiting.)**</small>

As a bonus, when your site uses HTMLDecor, "pushState assisted navigation" requires no additional setup. 
When someone viewing your page clicks on a link to another page that uses the same decor
then HTMLDecor updates the real content
and `history.pushState()` is used to update the browser URL. 

HTMLDecor.js is less than 10kB when minified and gzipped.

To see this in action visit my [blog](http://meekostuff.net/blog/) where I am dog-fooding this library.
Make sure you view the page source and check that it is just raw content.
The navbar and contact popup are all in the [site-decor page](http://meekostuff.net/blog/decor.html). 

For more info on the concept of HTMLDecor and its affinity with pushState assisted navigation, read  

- [The HTML decor concept](http://meekostuff.net/blog/HTML-Decor-I/)
- [Introducing HTMLDecor.js](http://meekostuff.net/blog/HTML-Decor-II/)
- [pushState was made for HTMLDecor](http://meekostuff.net/blog/pushState-was-made-for-HTMLDecor/)

More features are in the [road-map](https://github.com/meekostuff/HTMLDecor/wiki/Road-map).

If you have any questions or comments, don't hesitate to contact the author via
[web](http://meekostuff.net/), [email](mailto:shogun70@gmail.com) or [twitter](http://twitter.com/meekostuff). 


License
-------

HTMLDecor is available under 
[MPL 2.0](http://www.mozilla.org/MPL/2.0/ "Mozilla Public License version 2.0").
See the [MPL 2.0 FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html "Frequently Asked Questions")
for your obligations if you intend to modify or distribute HTMLDecor or part thereof. 


Installation
------------

1. Copy or clone the HTMLDecor files to a directory on your server, say 
	
		/path/to/HTMLDecor/

2. Open a browser and navigate to the following page
	
		http://your.domain.com/path/to/HTMLDecor/test/normal.html
	
	Visually inspect the displayed page for the following possible failures:
	
	- boxes with **red** background or borders. 
	- boxes that claim to be styled with colored borders but just have the default border. 
	
3. Source the HTMLDecor boot-script into your pages, with this line in the `<head>` of each page 
	
		`<script src="/path/to/HTMLDecor/boot.js"></script>`


Quick Start
-----------

**This is the old way of specifying decor, but is conceptually easiest to understand.**
**If you are new to HTMLDecor then read this documentation straight through.**
**Otherwise feel free to skip to the [Configuration](#configuration) section first.**

Create a HTML document (page.html) with some page specific content -
elements that are children of `<body>` and have `@id`. 
Any page specific scripts, styles or meta-data should go in `<head>`. 
The `<body>` may also contain fallback content, which is
only displayed if HTMLDecor is NOT enabled.

    <!DOCTYPE html>
	<html>
	<head>
		<!-- create a link to the decor page. All attributes are needed -->
		<link rel="meeko-decor" type="text/html" href="decor.html" />
		<!-- and source the HTMLDecor boot-script -->
		<script src="/path/to/HTMLDecor/boot.js"></script>
		<!-- include fallback stylesheets for when HTMLDecor doesn't run.
		    @title=nodecor stylesheets are removed !-->
		<link rel="stylesheet" href="nodecor.css" title="nodecor" />
		<!-- page specific style -->
		<style>
		.styled-from-page { border: 2px dashed green; }
		</style>
	</head>
	<body>
		<header>
		This fallback content will be removed from the page
		</header>
		
		<article id="__content"><!-- Page specific content, identified by @id -->
		#__content in page
			<div class="styled-from-decor">
			This content is styled by the decor stylesheet
			</div>	
			<div class="styled-from-page">
			This content is styled by the page stylesheet
			</div>	
		</article>
		
		<footer>
		This fallback content will be removed from the page
		</footer>
	</body>
	</html>
	
Create the decor document (decor.html).
This is a normal page of HTML that, when viewed in the browser,
will appear as the final page without the page specific content. 

	<!DOCTYPE html>
	<html>
	<head>
		<style>
		.styled-from-decor { border: 2px solid blue; }
		</style>
	</head>
	<body>
		<header>
		#header in decor
		</header>
		
		<div id="__main">
			#__main in decor
			<article id="__content">
			#__content in decor: This will be replaced by #__content from the page
			</article>
		</div>
		
		<footer>
		#footer in decor
		</footer>
	</body>
	</html>

When page.html is loaded into the browser, HTMLDecor will merge decor.html into it, following these steps:

1. Set the visibility of the page to "hidden". \*
2. Detect the first `<link rel="meeko-decor" href="..." />`, fully resolve the @href and use as the decor URL.
3. Load the decor URL into an iframe.
4. Fully resolve URLs for all scripts, images and links in the decor page. 
5. Insert `<script>`, `<style>`, `<link>`, and conditionally `<meta>` and `<title>` 
from the `<head>` of the decor page into the `<head>` of the content page.
6. Insert the child nodes of the `<body>` of the decor page at the start of the `<body>` in the content page
7. For each child node of the `<body>` in the content page, determine whether it should be deleted or moved into the decor.
 If a child node is an element with an ID, and the ID matches an element in the decor,
 then the element in the decor is replaced with the element from the content.
 All other child nodes of the body in the content page are deleted.
8. When all linked stylesheets for the document have loaded, set the visibility of the page to "visible".
This step may occur at any time during or after step 7. \*

\* Steps 1 & 8 are handled by the boot-script.

This process results in a DOM tree like this:

	<!DOCTYPE html>
	<html>
	<head>
		<style>
		.styled-from-decor { border: 2px solid blue; }
		</style>
		<!-- create a link to the decor page -->
		<link rel="meeko-decor" type="text/html" href="decor.html" />
		<!-- and source the HTMLDecor boot-script -->
		<script src="/path/to/HTMLDecor/boot.js"></script>
		<!-- page specific style -->
		<style>
		.styled-from-page { border: 2px dashed green; }
		</style>
	</head>
	<body>
		<header>
		#header in decor
		</header>
		
		<div id="__main">
			#__main in decor
			<article id="__content">
			#__content in page
				<div class="styled-from-decor">
				This content is styled by the decor stylesheet
				</div>	
				<div class="styled-from-page">
				This content is styled by the page stylesheet
				</div>	
			</article>
		</div>
		
		<footer>
		#footer in decor
		</footer>
	</body>
	</html>


Fallbacks
---------

Sometimes HTMLDecor will not be able to apply the decor document to the page.
This can occur because

- Javascript is disabled
- the HTMLDecor script failed to download
- HTMLDecor is configured to NOT autostart
- the decor document failed to download

In this scenario you would like the page to have some basic styling and auxiliary content -
something that can be dispensed with when HTMLDecor runs.

### Stylesheets

Any `<link rel="stylesheet">` or `<style>` elements that have `@title="nodecor"`
will be removed from the page before the decor document is applied, e.g.

	<style title="nodecor">body { max-width: 72ex; }</style>

### Auxiliary content

Children of `<body>` which have no `@id`,
or which have `@id` that cannot be found in the decor document
will be removed from the page before the decor is applied, e.g.

	<body>
		<div>
		This irrelevant content will be DEFINITELY REMOVED from the page
		because it has no @id
		</div>
		
		<div id="__irrelevant">
		This content will be REMOVED from the page
		assuming the decor has no element with matching @id
		</div>

		<div id="__content">
		This content will be RETAINED in the page
		assuming the decor has an element with matching @id
		</div>
	</body>	


PushState Assisted Navigation
-----------------------------

If `history.pushState` is available then HTMLDecor will conditionally over-ride the default browser behavior when hyperlinks are clicked.
If the @href of the hyperlink is a document that specifies the same decor as the current page then it can be merged into the current page
in a _similar_ way to the startup merging of decor and document. 

Some hyperlinks are not appropriate for this and are ignored by HTMLDecor:

- hyperlinks to pages on other sites 
- hyperlinks with a different protocol, e.g. `javascript:...`, `ftp:`
- hyperlinks that target a different window or iframe, e.g.
	
			<a href="some_page.html" target="_blank">...</a>
- anchor hyperlinks - `<a href="#skip">`

That leaves hyperlinks to other pages within the same site.

If a decor lookup function has been registered then HTMLDecor queries what the decor of the hyperlinked page would be.
If it is the same as the current decor then the page is downloaded and used to replace the real content of the current page. 

Otherwise normal browser navigation to the next page is triggered. 

**Note** that the HTMLDecor `click` handling can always be prevented by calling `event.preventDefault()`.

"PushState Assisted Navigation" (PAN) may sometimes be referred to as panning, as in [camera panning](http://en.wikipedia.org/Panning_\(camera\)). 

### Page Transition Animation

To enable author supplied animation of page transitions, HTMLDecor provides the `Meeko.panner.config()` method.
You could use it by placing something like the following in your **decor document**

	Meeko.panner.config({
		duration: 0, // minimum time (ms) between paging start and end. 
		nodeRemoved: {
			before: hide, // handler for before a content node leaves the page. Called at start of transition.
			after: show // handler for after a content node leaves the page. Cannot be called before duration has expired. 
		},
		nodeInserted: {
			before: hide, // handler for before a node enters the page, after the new url has been downloaded.
			after: show // handler for after a node enters the page. Called after a delay to allow styles set by `before` to be applied. 
		},
		pageOut: {
			before: noop,
			after: noop
		},
		pageIn: {
			before: noop, // indicates that the decor is ready for content to be placed. This would allow decor to be mutated in url dependent way
			after: noop // the equivalent of `window.onload` in non-pushstate enabled environments.
		}
	});

	function hide(msg) { msg.node.setAttribute("hidden", "hidden"); }
	function show(msg) { msg.node.removeAttribute("hidden"); }
	function noop() {}

These are actually the default options so there's no need to repeat these settings.
The method can be called at anytime. 
Key / value pairs in the passed options object overwrite the matching internal setting.

**NOTE** There is not always a notification **after** `pageOut`.
For instance, if the next page is ready before the transition duration has expired
then the new nodes replace the old nodes directly, rather than transitioning through the decor placeholders. 

**Example:** A simple way to achieve a fade-out / fade-in effect on page transition is to use the following in the decor document:

	<script>
	Meeko.panner.config({
		duration: 500 // allows our fade-out to complete
	});
	</script>
	<style>
	#__content { /\* assuming #__content is the page-specific content \*/
		-webkit-transition: opacity 0.5s linear;
		-moz-transition: opacity 0.5s linear;
		-ms-transition: opacity 0.5s linear;
		-o-transition: opacity 0.5s linear;
		transition: opacity 0.5s linear;
	}
	#__content[hidden] {
		display: block;
		visibility: visible;
		opacity: 0;
	}
	</style>


**Example:** If your pages rely on `@class` on the `<body>` or `<html>` elements,
the following will install them in the view-document when the page is panned in:

	<script>
	Meeko.panner.config({
		pageIn: {
			before: function(msg) {
				var doc = msg.node;
				if (document == doc) return;
				document.documentElement.className = doc.documentElement.className;
				document.body.className = doc.body.className;
			}
		}
	});
	</script>
	

### Waiting Indicators

If a new page takes longer than one second to load, the user may wonder if the loading has stalled.
In this case a waiting indicator is typically used to reassure the user that the page is still loading.
HTMLDecor provides a simple way to do this - when the `duration` has expired (and the next page still hasn't loaded)
the decor document is used as the waiting page. 

### Manual handling

You can stop HTMLDecor handling hyperlink clicks by calling `event.preventDefault()` in a click handler, e.g.

	document.onclick = function(event) { event.preventDefault(); }
	
You can also request HTMLDecor to navigate manually to a new URL by the following: 

	Meeko.panner.assign(newURL)
	
or with `history.replaceState()` behavior: 

	Meeko.panner.replace(newURL)


`<script>` handling
-------------------

- Scripts in the page are not handled by HTMLDecor - they execute at the expected time in the browser's script handling.
The page does not need and SHOULD NOT have scripts - they SHOULD all be part of the decor. 

- All scripts which are not in the initial page (that is, decor content or panned page content) are executed via dynamic script insertion, 
but behave **like** scripts that are part of the page content. Page content is not blocked, but earlier scripts block later scripts 
unless the earlier script has the `src` and `async` attributes. 

    `<script src="..." async></script>`

This dynamic script insertion is referred to as **enabling** in the following rules. 

- Scripts in the `<head>` of the decor are **enabled** AFTER all the content in the `<head>` of the decor is MERGED WITH the page.

- Scripts in the `<body>` of the decor are **enabled** AFTER all the content in the `<body>` of the decor is INSERTED INTO the page,
but BEFORE the page content is MERGED WITH the decor.

- When panning occurs, scripts in the `<head>` of the next page are **enabled** AFTER all the content in the `<head>` of the next page is MERGED WITH the page. 
Scripts in the `<body>` of the next page are **enabled** AFTER the content in the `<body>` of the next page is MERGED WITH the page.
You do not need and SHOULD NOT have scripts in any page (other than the decor document). 


Debugging
---------

By default, HTMLDecor logs error and warning messages to the browser console.
The logger can be configured to provide info and debug messages (see Configuration).

External code is called from HTMLDecor (e.g. nodeInserted / nodeRemoved hooks)
using [event dispatch](http://dean.edwards.name/weblog/2009/03/callbacks-vs-events/)
instead of `try / catch` blocks.
This isolates HTMLDecor from errors in external code,
but doesn't prevent errors and stack-traces being logged in the browser console.

Unfortunately, Firefox [doesn't log errors in event-listeners](https://bugzilla.mozilla.org/show_bug.cgi?id=503244).
You may find debugging easier in a different browser. 


Configuration
-------------

### Preparation

Assuming the default [installation](#installation) was successful,
use these steps to prepare for site specific configuration.

1. Copy `options.js` **and** `config.js` from the HTMLDecor directory to the root directory of your domain.
	
	If you have unix shell access to the domain's server 
	
			cd /directory/of/your/domain
			cp path/to/HTMLDecor/options.js path/to/HTMLDecor/config.js .

2. Edit your copy of `options.js` to change the following lines
	
			"htmldecor_script": '{bootscriptdir}HTMLDecor.js',
			"config_script": '{bootscriptdir}config.js'
	
	to be
	
			"htmldecor_script": '/path/to/HTMLDecor/HTMLDecor.js',
			"config_script": '/config.js'

3. Concatenate your modified `options.js` with `boot.js` from the HTMLDecor directory
and store in `boot.js` of the root directory.
	
			cat options.js path/to/HTMLDecor/boot.js > boot.js

4. Source the modified HTMLDecor boot-script into your pages -
preferably before any stylesheets - 
with this line in the `<head>` of each page 
	
			<script src="/boot.js"></script>

5. Make sure to test the modifications.  
	You could symlink to the test directory from the root directory
	
			ln -s path/to/HTMLDecor/test
	
	then navigate in the browser to
	
			http://your.domain.com/test/normal.html


Now you have a simple setup allowing you to:

- modify your options without affecting the HTMLDecor installation, and
- update HTMLDecor without overwriting your options.

When you want to:

+ modify options
	- edit your copy of `options.js`
	- repeat step 3 to rebuild your boot-script

+ update HTMLDecor
	- overwrite the HTMLDecor directory with the latest version
	- repeat step 3

+ minify HTMLDecor.js
	- minify HTMLDecor.js to HTMLDecor.min.js in the /path/to/HTMLDecor directory
	- change `htmldecor_script` to `/path/to/HTMLDecor/HTMLDecor.min.js` in your copy of the `options.js` file
	- repeat step 3

+ minify boot.js
	- minify boot.js to boot.min.js in the /path/to/HTMLDecor directory
	- repeat step 3 with `path/to/HTMLDecor/boot.min.js`


### Boot options

These options aren't specifically related to the operation of HTMLDecor. 
The boot-script has the following options (default values in **bold**).

- htmldecor_script: **"{bootscriptdir}HTMLDecor.js"**
- log_level: "none", "error", **"warn"**, "info", "debug"
- polling_interval: **50** (milliseconds)
- autostart: **true**, false
- hidden_timeout: **3000** (milliseconds)
- html5\_block\_elements: **"article aside figcaption figure footer header hgroup main nav section"**
- html5\_inline\_elements: **"abbr mark"**
- config_script: **"{bootscriptdir}config.js"**

Sources for options are detailed below. 


#### From `Meeko.options`

**NOTE** this is how options are set in `options.js`.  
Options can be **preset** by script, like this:

    <script>
	var Meeko = window.Meeko || (window.Meeko = {});
	Meeko.options = {
		log_level: "info",
		autostart: false,
		hidden_timeout: 1000
	};
	</script>

This tells HTMLDecor to
- log 'info', 'warn' and 'error' messages
- prevent automatic startup, and
- when a manual start is requested to hide the page until all decor-resources are loaded *or*
	1000 milliseconds (1 second) have elapsed, whichever comes *first*.

If autostart is turned off, HTMLDecor can be manually started by calling `Meeko.decor.start()`.

#### From localStorage and sessionStorage
When debugging a page you probably don't want to modify the page source to change HTMLDecor options,
especially as you may have to change them back after you've found the problem.
For this reason HTMLDecor reads `sessionStorage` and `localStorage` at startup, looking for config options.
`sessionStorage` options override those found in `localStorage`, which in turn override those in data-attributes.

Config options are read from JSON stored in the `Meeko.options` key. Thus the following would prevent `autostart` and turn on `debug` logging.

	sessionStorage.setItem('Meeko.options', JSON.stringify({ autostart: false, log_level: "debug" }) );

_Note_ that the page would require a refresh after these settings were made.


### HTMLDecor configuration

There are two aspects of HTMLDecor:

1. Decoration - the wrapping of the primary content of the page with site decor

2. Panning - replacing the primary content of the page while retaining the same decor

These aspects are opposite in purpose, but similar in operation.
In particular, they both involve: 
- downloading of external content
- normalizing this content to prepare for HTMLDecor processing
- notifications of content insertion / removal, etc


### Decorator engine

Options for the decorator are stored in `Meeko.decor.options`,
which can be accessed directly or by calling 

	Meeko.decor.config(options);
	
where `options` is an object containing key / value pairs
that will overwrite current values.

Configuration should be done before HTMLDecor starts. 
This can be achieved by editing the site-specific `config.js` created during [Preparation](#preparation).

Usually you only want to configure how HTMLDecor determines the appropriate decor-document for a page. 
Do this by providing one of the following options: 

- **`detect(doc)`**  
	MUST return the decor-URL by inspecting the current page when HTMLDecor starts (this doesn't allow panning)

- **`lookup(url)`**  
	MUST return the decor-URL for any URL in the site, either the current `document.URL`,
	or the URL of a different page that is to be panned in.

`lookup(url)` is the recommended option.
`detect(doc)` is mainly provided for backwards compatibility,
as can be seen in the default `config.js` script. 

**TODO:** `request`, `normalize`, notifications


### Panner engine

Options for the panner are stored in `Meeko.panner.options`,
which can be accessed directly or by calling 

	Meeko.panner.config(options);
	
where `options` is an object containing key / value pairs
that will overwrite current values.

Typically you only want to configure panner animation options.
These would be set in the decor-document,
as dealt with in [Page Transition Animation](#page-transition-animation).

All other configuration should be done before HTMLDecor starts. 
This can be achieved by editing the site-specific `config.js` created during [Preparation](#preparation).


#### Pre-decorated pages

Pages on your site may not be in the format that HTMLDecor and your decor-document are expecting.
The most likely scenario for this is that your primary content containers
are not direct children of the `<body>`,
or they do not have @id.
In this case you need to provide a `normalize(doc)` function
which will manipulate the DOM of `doc` into the appropriate format, e.g.

		Meeko.panner.config({
			normalize: function(doc) {
				var content = doc.getElementsByTagName('main')[0];
				content.id = '__content';
				doc.body.innerHTML = '';
				doc.body.appendChild(content);
			}
		});

**NOTE:** configuring the `normalize` option prevents initial page decoration
until the `DOMContentLoaded` event (or safest equivalent). 


#### Non-HTML payloads

You can also make your landing-page download as HTML 
and thereafter request, say JSON, and build the primary-content HTML in the browser.
Do this by providing a `request(url, data, details, callback)` function, where

+ **url** is the URL of the page to be panned in
+ **data** is any form data (**WARNING** not implemented yet)
+ **details** is an object containing at least the `URL` and `method`
+ **callback** is an object with `complete(result)` and `error(err)` callback-methods
	
An example of configuration might be

		Meeko.panner.config({
			request: function(url, data, details, callback) { // assumes 'GET'
				var rq = new XMLHttpRequest;
				rq.open('GET', url, true);
				rq.setRequestHeader('Accept-Type', 'application/json');
				rq.onreadystatechange = onchange;
				rq.send();
				function onchange() {
					if (rq.readyState != 4) return;
					if (rq.status != 200) {
						callback.error(rq.status);
						return;
					}
					onload();
				}
				function onload() {
					var json = JSON.parse(rq.responseText);
					var doc = document.implementation.createHTMLDocument(json.title);
					doc.body.innerHTML = processJSON(json); // your json-to-html converter
					callback.complete(doc);
				}
			}
		});


### Bonus APIs

HTMLDecor defines various utility classes and functions for internal use.
Many of these are also available for external use if appropriate.
The most useful of these are in the `Meeko.DOM` namespace, and include 

+ `Meeko.DOM.URL`
	This provides overlapping functionality with the [proposed URL API](http://url.spec.whatwg.org/#api). 
	`Meeko.DOM.URL(absoluteURL)` will return a URL object with the following (read-only) fields:  
	- `href`, `protocol`, `host`, `hostname`, `port`, `pathname`, `search`, `hash` **(Standard)**  
	- `nopathname`, `basepath`, `base`, `nosearch`, `nohash` **(Extensions)**  
	The URL object also has the `resolve(relativeURL)` method which performs a
	fast conversion of a relative URL to absolute, using itself for the `baseURL`.
	
+ `Meeko.DOM.$id`
	This is short-hand for `document.getElementById` (typically aliased to `$id` in a code block)

+ `Meeko.DOM.$$`
	This is short-hand for `document.getElementsByTagName` (typically aliased to `$$` in a code block)



Notes and Warnings
------------------
- HTMLDecor may not be compatible with IE behaviors, eg [CSS3 PIE](http://css3pie.com/).
- The decor document is loaded via XMLHttpRequest(), parsed to disable scripts, then written into an iframe using `document.write()`. 
- unlike CSS, decor pages should be in the same domain as the content page otherwise the browsers cross-site restrictions will apply.
Detection for this hasn't been implemented yet. 
- any stylesheets in the content document and with a title of "nodecor" will be deleted at the start of merging of the decor page. 
This allows for a fallback styling option of decor-less pages. For example, the following stylesheets would be removed:  
`<style title="nodecor">...</style>`  
AND  
`<link rel="stylesheet" href="style.css" title="nodecor" />`  
- in most current browsers, elements from the content can be moved into the decor *while the element is still loading*. 
On IE6,7,8 this will throw an error, so for those browsers the decor is inserted and elements moved only after the DOM has fully loaded.
- the configuration options and mechanism may change in future releases
- URLs in `<style>` sections of the decor are not resolved.
This means that relative URLs - which are meant to be relative to the decor URL - 
will probably be wrong when imported into the page.
The work-around for this is to use absolute-paths or absolute-URLs (which you should probably be using anyway).
- There are no compatibility checks and warnings between the content and decor pages (charset, etc)
- There are no compatibility checks and warnings between the content element and the decor element it replaces (tagName, attrs, etc). 


TODO
----
- this README is too long - needs to be split up into sub-sections
- some features would be best explained with demo pages / sites 

