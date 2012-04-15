HTMLDecor
=========

> Why should you use the server to merge your real page content 
> with your banner, navbars, ads, page-layout and stylesheets? 
> Put all that site decor in its own page 
> and let HTMLDecor merge them in the browser. 
> You'll cut the download time of every page,
> plus "pushState assisted navigation" comes for free.

HTMLDecor allows your site to deliver real page content first (and fast).
Your site decor can be placed in its own page and merged in the browser instead of on the server. 

A site decor page is similar to an external stylesheet in that it can be shared between several pages
**and** it is referenced with a resource link, like so 

    <link rel="meeko-decor" type="text/html" href="decor.html" />

As a bonus, when your site uses HTMLDecor it gets "pushState assisted navigation" by default. 
When someone viewing your page clicks on a link to another page that uses the same decor
then HTMLDecor updates the real content
and `history.pushState()` is used to update the browser URL. 

HTMLDecor.js is less than 7kB when minified and gzipped.
You can even access HTMLDecor.js from a CDN at
http://dist.meekostuff.net/HTMLDecor/1.3-stable/HTMLDecor.js

To see this in action visit my [blog](http://meekostuff.net/blog/) where I am dog-fooding this script.
Make sure you view the page source and check that it is just raw content.
The ad, navbar and contact popup are all in the [site-decor page](http://meekostuff.net/blog/decor.html). 

For more info on the concept of HTMLDecor and its affinity with pushState assisted navigation, read  

- [The HTML decor concept](http://meekostuff.net/blog/HTML-Decor-I/)
- [Introducing HTMLDecor.js](http://meekostuff.net/blog/HTML-Decor-II/)
- [pushState was made for HTMLDecor](http://meekostuff.net/blog/pushState-was-made-for-HTMLDecor/)

More features are in the [road-map](https://github.com/shogun70/HTMLDecor/wiki/Road-map).

If you have any questions or comments, don't hesitate to contact the author via
[web](http://meekostuff.net/), [email](mailto:shogun70@gmail.com) or [twitter](http://twitter.com/#!/meekostuff). 


Quick Start
-----------

Create a HTML document (page.html) with some page specific content in the `<body>`.
If there are page specific scripts, styles or meta-data they should go in the `<head>`. 
The `<body>` may also contain fallback content, which is
content that would only be displayed when scripting is disabled
and will be removed during HTMLDecor processing.
The `<head>` may also contain fallback stylesheets, which have `@title="nodecor"`. 

    <!DOCTYPE html>
	<html>
	<head>
		<!-- create a link to the decor page. All attributes are needed -->
		<link rel="meeko-decor" type="text/html" href="decor.html" />
		<!-- and source the HTMLDecor script -->
		<script src="http://dist.meekostuff.net/HTMLDecor/1.3-stable/HTMLDecor.js"></script>
		<style>
		.page { border: 2px solid green; }
		</style>
		<style title="nodecor">
		/* this style only applies if scripting is disabled or the decor doesn't load */
		#page-main { background-color: red; }
		</style>
	</head>
	<body>
		<div>
		This irrelevant content will be removed from the page
		</div>
		
		<div id="page-main">
		#page-main
			<div class="page">
			This content is styled by the page stylesheet
			</div>
			<div class="decor">
			This content is styled by the decor stylesheet
			</div>	
		</div>
		
		<div>
		This irrelevant content will be removed from the page
		</div>
	</body>
	</html>
	
Create the decor document (decor.html).
This is a normal page of HTML that, when viewed in the browser,
will appear as the final page without the page specific content. 

	<!DOCTYPE html>
	<html>
	<head>
		<style>
		.decor { border: 2px solid blue; }
		</style>
	</head>
	<body>
		<div id="header">
		#header in decor
		</div>
		
		<div id="main">
			#main in decor
			<div id="page-main">
			#page-main in decor: This will be replaced by #page-main from the page
			</div>
		</div>
		
		<div id="footer">
		#footer in decor
		</div>
	</body>
	</html>

When page.html is loaded into the browser, HTMLDecor.js will merge decor.html into it, resulting in a DOM tree like this:

	<!DOCTYPE html>
	<html>
	<head>
		<style>
		.decor { border: 2px solid blue; }
		</style>
		<!-- create a link to the decor page -->
		<link rel="meeko-decor" type="text/html" href="decor.html" />
		<!-- and source the HTMLDecor script -->
		<script src="/path/to/HTMLDecor.js"></script>
		<style>
		.page { border: 2px solid green; }
		</style>
	</head>
	<body>
		<div id="header">
		#header in decor
		</div>
		
		<div id="main">
			#main in decor
			<div id="page-main">
			#page-main
				<div class="page">
				This content is styled by the page stylesheet
				</div>
				<div class="decor">
				This content is styled by the decor stylesheet
				</div>	
			</div>
		</div>
		
		<div id="footer">
		#footer in decor
		</div>
	</body>
	</html>

Installation
------------

The easiest way to use HTMLDecor is via the CDN. Simply include the following line in the `<head>` of your page:

		<script src="http://dist.meekostuff.net/HTMLDecor/1.3-stable/HTMLDecor.js"></script>
		
Alternatively you can [download HTMLDecor.js](http://dist.meekostuff.net/HTMLDecor/1.3-stable/HTMLDecor.js)
and install it on your server. 

How it works
------------
1. Set the visibility of the page to "hidden".
2. Detect the first `<link rel="meeko-decor" href="..." />`, fully resolve the @href and use as the decor URL.
3. Load the decor URL into an iframe.
4. Fully resolve URLs for all scripts, images and links in the decor page. 
5. Insert `<script>`, `<style>`, `<link>`, and conditionally `<meta>` and `<title>` 
from the `<head>` of the decor page into the `<head>` of the content page.
6. Insert the innerHTML of the `<body>` in the decor page at the start of the `<body>` in the content page
7. For each child node of the `<body>` in the content page, determine whether it should be deleted or moved into the decor.
 If a child node is an element with an ID, and the ID matches an element in the decor,
 then the element in the decor is replaced with the element from the content.
 All other child nodes of the body in the content page are deleted.
8. When all linked stylesheets for the document have loaded, set the visibility of the page to "visible".
This step may occur at any time during or after step 7.


PushState Assisted Navigation
-----------------------------

If `history.pushState` is available then HTMLDecor will conditionally over-ride the default browser behavior when links are clicked.
If the @href of the link is a document that specifies the same decor as the current page then it can be merged into the current page
in a _similar_ way to the startup merging of decor and document. 

Some links are not appropriate for this and are ignored by HTMLDecor:

- links to pages on other sites 
- links with a different protocol, e.g. `javascript:...`, `ftp:`
- links that target a different window or iframe, e.g.

        <a href="some_page.html" target="_blank">...</a>
- anchor links - `<a href="#skip">`

That leaves links to other pages within the same site. HTMLDecor assumes that any page within the same site *might* have the same decor. The page is downloaded and, if the specified decor is the same, it is merged. 

Otherwise normal browser navigation to the next page is triggered. 

What happens then is the browser loads the next page from cache (assuming that HTTP caching headers allow it) which in turn loads the HTMLDecor script (again from cache) and then the appropriate decor is loaded and merged into the raw content.  

So, assuming caching is configured, the only thing that needs to be fetched from the server is the decor for the next URL.

**Note** that the HTMLDecor `click` handling can always be prevented by calling `event.preventDefault()`.

"PushState Assisted Navigation" (PAN) may sometimes be referred to as panning, as in [camera panning](http://en.wikipedia.org/Panning_\(camera\)). 

`<script>` handling
-------------------

- Scripts in the page are not handled by HTMLDecor - they execute at the expected time in the browser's script handling.
The page does not need and SHOULD NOT have scripts - they SHOULD all be part of the decor. 

- All scripts which are not in the initial page (that is, decor content or panned page content) are executed via dynamic script insertion.
Thus inline scripts are executed immediately, and downloaded scripts are executed asynchronously.
This dynamic script insertion is referred to as **enabling** in the following rules. 

- Scripts in the `<head>` of the decor are **enabled** AFTER all the content in the `<head>` of the decor is MERGED WITH the page.

- Scripts in the `<body>` of the decor are **enabled** AFTER all the content in the `<body>` of the decor is INSERTED INTO the page,
but BEFORE the page content is MERGED WITH the decor.

- When panning occurs, scripts in the `<head>` of the next page are **enabled** AFTER all the content in the `<head>` of the next page is MERGED WITH the page. 
Scripts in the `<body>` of the next page are **enabled** AFTER the content in the `<body>` of the next page is MERGED WITH the page.
You do not need and you SHOULD NOT have scripts in the next page.

Alternate Decor
---------------

HTMLDecor relies on `<link>` elements to reference the decor for a page, like so

    <link rel="meeko-decor" type="text/html" href="decor.html" />

This is similar to the way external stylesheets are associated with the page,
the main exception being that multiple stylesheets can be applied to the page.

**NOTE** that all decor `<link>` must be in the `<head>` of the page before the `HTMLDecor.js` script is included.

HTMLDecor also allows a page to specify more than one decor file and let the most specific one be chosen in the browser.
A decor `<link>` may have attributes that, when matched, increase its specificity for the page and,
when unmatched, disqualify it from being chosen. The attributes are:

#### media

    <link rel="meeko-decor" type="text/html" media="handheld" href="handheld-decor.html" />

This is intended to have the same meaning as `media` stylesheets.
If the `window.matchMedia()` method doesn't exist then these decor pages are disqualified.
Otherwise `window.matchMedia()` is used to determine if the decor is appropriate. 

**WARNING** Some media probably don't support javascript (e.g. `print`).
HTMLDecor settings would be useless for those media.

#### data-frame-theme

    <link rel="meeko-decor" type="text/html" data-frame-theme="simple" href="simple-decor.html" />

This allows a page to have a different decor when inside an `iframe` - say a popup view of another page.  
The decor can only be chosen if the page is in an `iframe` and the `iframe` has a `data-theme` attribute with matching value.

#### data-user-theme

    <link rel="meeko-decor" type="text/html" data-user-theme="minimal" href="minimal-decor.html" />

This allows the page to let the user influence the choice of decor. 
The decor can only be chosen if if the `meeko-decor-theme` key from `sessionStorage` or `localStorage` has a matching value.

If one or more of these attributes are present then they MUST ALL be valid, otherwise the decor is disqualified.
If there are several decor files that still qualify then any decor with `@data-user-theme` is most specific,
followed by `@data-frame-theme`, followed by `@media`, followed by decor with none of these attributes.

If there is more than one decor with the same specificity then the first one in the page is chosen. 

### Decor Redirection

Alternate decor can also be specified from the decor file.
This allows you to start using alternate decor without modifying the real content pages.
In the decor file for a page, simply link to alternate versions of the decor using `@rel="alternate"`, e.g.

    <link rel="alternate" type="text/html" media="handheld" href="handheld-decor.html" />
    <link rel="alternate" type="text/html" data-frame-theme="simple" href="simple-decor.html" />
    <link rel="alternate" type="text/html" data-user-theme="minimal" href="minimal-decor.html" />

License
-------

HTMLDecor is available under 
[MPL 2.0](http://www.mozilla.org/MPL/2.0/ "Mozilla Public License version 2.0").
See the [MPL 2.0 FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html "Frequently Asked Questions")
for your obligations if you intend to modify or distribute HTMLDecor or part thereof. 

Notes and Warnings
------------------
- All decor `<link>` elements must be in the head **before** the HTMLDecor `<script>`. Later ones are ignored. 
- If the type of the decor URL is undeclared or "text/html" then the decor page is loaded via XMLHttpRequest(), parsed to disable scripts,
then written into the iframe using `document.write()`. 
- unlike CSS, decor pages should be in the same domain as the content page otherwise the browsers cross-site restrictions will apply.
Detection for this hasn't been implemented yet. 
- any stylesheets in the content document and with a title of "nodecor" will be deleted at the start of merging of the decor page. 
This allows for a fallback styling option of decor-less pages. For example, the following stylesheets would be removed  
`<style title="nodecor">...</style>`  
or  
`<link rel="stylesheet" href="style.css" title="nodecor" />`  
- if HTMLDecor.js detects that it is included in a decor page then it will abort. This allows you to use a decor page as a normal page 
in your site if that is desirable. 
- in most current browsers, elements from the content can be moved into the decor *while the element is still loading*. 
On IE6,7,8 this will throw an error, so for those browsers the decor is inserted and elements moved only after the DOM has fully loaded.
- the configuration options and mechanism may change in future releases

Debugging
---------
By default, HTMLDecor logs error and warning messages to the browser console.
The logger can be configured to provide info and debug messages (see Configuration).

The configuration options may also be useful for debugging.

Configuration
-------------

You probably don't want to change the default configuration, but if you find the need, here's how.

HTMLDecor has the following config options (default values in **bold**).

- log-level: "none", "error", **"warn"**, "info", "debug"
- polling-interval: **50** (milliseconds)
- decor-autostart: **true**, false
- decor-hidden-timeout: **3000** (milliseconds)

HTMLDecor reads config options immediately after the script loads.
Sources for configuration options are detailed below. 

### From data-* attributes
Options can be preset using data-attributes of the script which loads HTMLDecor, like this

    <script src="/path/to/HTMLDecor.js" data-log-level="debug"></script>
	
Any options which are prefixed with `decor-` need the prefix removed when written as a data-attribute, for example 

    <script src="/path/to/HTMLDecor.js" data-hidden-timeout="1000"></script>
	
Boolean options, such as `decor-autostart`, can have any of these boolean-like values: true/false, yes/no, on/off, 1/0

    <script src="/path/to/HTMLDecor.js" data-autostart="no"></script>

Typically the only important options are `decor-autostart` and `decor-hidden-timeout`, for example 

    <script src="/path/to/HTMLDecor.js" data-autostart="no" data-hidden-timeout="1000"></script>

This tells HTMLDecor not to start automatically, and when a manual start is requested to
hide the page until all decor-resources are loaded *or*
1000 milliseconds (1 second) have elapsed, whichever comes *first*.

If autostart is turned off, HTMLDecor can be manually started by calling `Meeko.decor.start()`.

### From localStorage and sessionStorage
When debugging a page you probably don't want to modify the page source to change HTMLDecor options,
especially as you may have to change them back after you've found the problem.
For this reason HTMLDecor reads `sessionStorage` and `localStorage` at startup, looking for config options.
`sessionStorage` options override those found in `localStorage`, which in turn override those in data-attributes.

Config options must be prefixed with `meeko-`. Thus the following would prevent `autostart` and turn on `debug` logging.

	sessionStorage.setItem('meeko-decor-autostart', 'no');
	sessionStorage.setItem('meeko-log-level', 'debug');

_Note_ that the page would require a refresh after these settings were made.

### From the page URL query options
`localStorage` and `sessionStorage` are not available on all browsers (particularly IE6 and IE7).
HTMLDecor looks in the query part of the page URL for config options.
Config options must be prefixed with `meeko-`. Thus the following would prevent `autostart` and turn on `debug` logging.

	http://example.org/index.html?meeko-decor-autostart=no&meeko-log-level=debug
	
URL query options override all other settings. 


TODO
----
- better docs, including logger and decor APIs
- compatibility checks and warnings between the content and decor pages (charset, etc)
- compatibility checks and warnings between the content element and the decor element it replaces (tagName, attrs, etc). 
- provide an API for scripts in the decor document to intercept different stages of processing
- a stylesheet switcher
- URLs in `<style>` sections of the decor are not resolved. This means that relative URLs (which are meant to be relative to the decor URL)
will probably be wrong when imported into the page. 
- investigate the use of [HTML in XMLHttpRequest](https://developer.mozilla.org/en/HTML_in_XMLHttpRequest) in place of an iframe. 
- delayed loading (or user-triggered loading) of sections of the page
- configuration might be better using JSON
- configuration by data-options on the HTMLDecor `<script>` might be better as a `<meta>`
- an alternative for pan-triggering hyperlinks might be to use `@target="_self"`;
- `<link rel="meeko-decor" data-assert="capability_check()" ... />` for more flexibility in specifying decor document
- HTMLDecor equivalents of `showModalDialog()` and `showModelessDialog()` using iframes and with theming option

