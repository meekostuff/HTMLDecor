/* START HTMLDecor boot options */

/*
This code MUST run before the boot-script.
  EITHER
Prepend this code to the boot-script (for performance)
  OR 
Source this file into the page before sourcing the boot-script (to simplify reconfiguration)
*/

var Meeko = window.Meeko || {};
Meeko.options = { // these are the default values
	"htmldecor_script": '{bootscriptdir}HTMLDecor.js', // use an abs-path or abs-url
	"log_level": "warn", // debug, info, warn, error, none
	"ignore_cookie_options": false,
	"autostart": true, 
	"hidden_timeout": 3000,
	"polling_interval": 50,
	"html5_block_elements": 'article aside figcaption figure footer header hgroup main nav section',
	"html5_inline_elements": 'abbr mark',
	"config_script": '{bootscriptdir}config.js' // can be a script-url OR a function
};

/* END HTMLDecor boot options */
