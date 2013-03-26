<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="normal.css" />
<link rel="meeko-decor" type="text/html" href="decor/decor.html" />
<script src="../boot.js"></script>
<style type="text/css">
div { margin: 0.5em; border: 1px dashed black; }
.remove { background-color: red; color: white; }
</style>
<style type="text/css" title="nodecor">
.nodecor { background-color: red; color: white; }
</style>
</head>
<body>
<div class="remove">
before #page-banner: You should NOT be able to see this content. 
</div>
<div id="page-header">
#page-header
<h1>&lt;form method="post"&gt; response-page</h1>
</div>
<div class="remove">
before #page-main: You should NOT be able to see this content. 
</div>
<div id="page-main">
#page-main
<div class="normal">
	<p>Data received: </p>
	<blockquote><?php echo $_POST['q'] ?></blockquote>
</div>

</div>
<div class="remove">
after #main: You should NOT be able to see this content. 
</div>
<div id="page-footer">
#page-footer
</div>
</body>
</html>

