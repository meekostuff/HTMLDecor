HTMLDecor
=========

One of the advantages of CSS is the capability to provide styling information to many web-pages using one (or several) external stylesheets. Not only does this reduce duplication, cutting down the size of each page, it also means that pages don't need to be regenerated whenever styles are updated.

There is still, however, significant duplication in web-pages - banners, navigation, and footers are usually the same for many pages of a site, if not the whole site. Any changes to the structure or text in these generic sections will require regenerating all pages. 

What if there was a way to specify this page decor in an external file? Unadorned web-pages could be sent to the browser which could then add the decor from a common file. **HTMLDecor.js** is designed for this purpose. 

To see this in action visit http://meekostuff.net/blog/ where I am dog-fooding this script. 
There is also a trivial test page at http://devel.meekostuff.net/HTMLDecor/0.9-devel/test/normal.html

Quick Start
-----------

Create a HTML document (page.html) with some page specific content:

	<!DOCTYPE html>
	<html>
	<head>
		<!-- create a link to the decor page. All attributes are needed -->
		<link rel="meeko-decor" type="text/html" href="decor.html" />
		<!-- and source the HTMLDecor script -->
		<script src="/path/to/HTMLDecor.js"></script>
		<style>
		.page { border: 2px solid green; }
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
	
Create the decor document (decor.html):

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

How it works
------------
1. Set the visibility of the page to "hidden".
2. Detect the first `<link rel="meeko-decor" href="..." />`, fully resolve the @href and use as the decor URL.
3. Load the decor URL into an iframe.
4. Fully resolve URLs for all scripts, images and links in the decor page. 
5. Insert `<script>`, `<style>`, `<link>`, and conditionally `<meta>` and `<title>` 
from the `<head>` of the decor page into the `<head>` of the content page.
6. In a browser dependent order:
 - insert the innerHTML of the `<body>` in the decor page at the start of the `<body>` in the content page
 - for each child node of the `<body>` in the content page, determine whether it should be deleted or moved into the decor. If a child node is an element with an ID, and the ID matches an element in the decor, then the element in the decor is replaced with the element from the content. All other child nodes of the body in the content page are deleted. 
 - when all linked stylesheets for the document have loaded, set the visibility of the page to "visible".

License
-------

HTMLDecor is available under 
[MPL 2.0](http://www.mozilla.org/MPL/2.0/ "Mozilla Public License version 2.0").
See the [MPL 2.0 FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html "Frequently Asked Questions")
for your obligations if you intend to modify or distribute HTMLDecor or part thereof. 

Notes and Warnings
------------------
- *Enable browser caching for your decor pages and resources*, otherwise each one will incur *two* round-trips to the server. This would be a **BAD THING**. 
- If the type of the decor URL is "text/decor+html" then the decor page is loaded directly into an iframe using the `src` attribute. If the type is undeclared or "text/html"  then the page will be loaded via XMLHttpRequest(), parsed to disable scripts, then written into the iframe using `document.write()`. 
- it is generally undesirable for scripts in the decor page to run until after they are inserted into the content page. 
  + For "text/html" decor pages, all scripts are disabled within the decor iframe, except those that have *none* of the attributes: `src`, `async`, `defer`. These scripts are enabled when the decor is merged with the page. 
  + For "text/decor+html" decor pages, scripts can be targeted to the content page by declaring their type as "text/javascript?async". These scripts won't be run, but when they are merged into the content page the type is changed to "text/javascript" and they run then. Scripts with no declared type, or type of "text/javascript" will run in the decor iframe. These could be used to modify the decor in preparation for the specific content page. 
- unlike CSS, decor pages should be in the same domain as the content page otherwise the browsers cross-site restrictions will apply. Detection for this hasn't been implemented yet. 
- any stylesheets - `<style>` or `<link rel="stylesheet">` - in the content document and with a title of "nodecor" will be deleted at the start of merging of the decor page. This allows for a fallback styling option of decor-less pages. 
- if HTMLDecor.js detects that it is included in a decor page then it will abort. This allows you to use a decor page as a normal page in your site if that is desirable. 
- in most current browsers, elements from the content can be moved into the decor *while the element is still loading*. On IE6,7,8 this will throw an error, so for those browsers the decor is inserted and elements moved only after the DOM has fully loaded. This makes the decor the last thing to appear on the page. It would be desirable to provide a different option for these browsers. 


Debugging
---------
By default, HTMLDecor logs error and warning messages to the browser console.
The logger can be configured to provide info and debug messages (see Configuration).

The configuration options may also be useful for debugging.

Configuration
-------------
HTMLDecor has the following config options (default values in <b>bold</b>).

- log-level: "none", "error", <b>"warn"</b>, "info", "debug"
- decor-autostart: <b>true</b>, false
- decor-hidden-timeout: <b>3000</b> (milliseconds)
- decor-polling-interval: <b>50</b> (milliseconds)

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

    <script src="/path/to/HTMLDecor.js" data-autostart="no" data-hidden-timeout="0"></script>

This tells HTMLDecor not to start automatically, and when a manual start is requested to
hide the page until all decor-resources are loaded *or*
1000 milliseconds (1 second) have elapsed, whichever comes *first*.

If autostart is turned off, HTMLDecor can be manually started by calling `Meeko.stuff.decorSystem.start()`.

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
- better docs, including logger and decorSystem APIs
- don't duplicate `<script>` with the same @src, or `<link>` with the same @href.
- compatibility checks and warnings between the content and decor pages (charset, etc)
- compatibility checks and warnings between the content element and the decor element it replaces (tagName, attrs, etc). 
- configuration options, like maximum hidden time, polling interval, log-level. 
- provide an API for scripts in the decor document to intercept different stages of processing
- a stylesheet switcher
- redirection options in the decor page, so that it could detect the browser, device, media size and capabilities, and load a more appropriate decor page. 
- URLs in `<style>` sections of the decor are not resolved. This means that relative URLs (which are meant to be relative to the decor URL) will probably be wrong when imported into the page. 
- incorporate history.pushState() to fast-load content pages that share the same decor document. 


