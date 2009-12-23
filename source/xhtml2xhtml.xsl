<?xml version="1.0"?>
<xsl:stylesheet version="1.0" exclude-result-prefixes="xsl"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:html="http://www.w3.org/1999/xhtml"
	xmlns="http://www.w3.org/1999/xhtml">

<xsl:output method="xml" indent="no" omit-xml-declaration="yes"
	doctype-public="-//W3C//DTD XHTML 1.0 Transitional//EN"/>

<xsl:template match="@*|node()">
	<xsl:copy>
		<xsl:apply-templates select="@*|node()"/>
	</xsl:copy>
</xsl:template>

</xsl:stylesheet>
