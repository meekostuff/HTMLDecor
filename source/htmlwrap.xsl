<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" exclude-result-prefixes="xsl html"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:html="http://www.w3.org/1999/xhtml"
	xmlns="http://www.w3.org/1999/xhtml">

<xsl:output method="xml" omit-xml-declaration="yes" cdata-section-elements=""
	doctype-public="-//W3C//DTD XHTML 1.0 Transitional//EN"/>
<xsl:variable name="top" select="/" />
<xsl:param name="WRAPPER_URL"/>
<xsl:variable name="WRAPPER_LINK" select="html:html/html:head/html:link[@rel='wrapper'][1]"/>

<xsl:variable name="wrapper">
	<xsl:choose>
		<xsl:when test="$WRAPPER_URL"><xsl:value-of select="$WRAPPER_URL"/></xsl:when>
		<xsl:when test="$WRAPPER_LINK"><xsl:value-of select="$WRAPPER_LINK/@href"/></xsl:when>
		<xsl:otherwise>
			<xsl:message terminate="yes">No wrapper URL given</xsl:message>
		</xsl:otherwise>
	</xsl:choose>
</xsl:variable>

<xsl:template match="@*|node()">
	<xsl:copy>
		<xsl:apply-templates select="@*|node()"/>
	</xsl:copy>
</xsl:template>

<xsl:template match="/">
	<xsl:apply-templates select="document($wrapper)" mode="wrapper" />
</xsl:template>

<xsl:template match="html:link[@rel='wrapper']"/>

<xsl:template match="@*|node()" mode="wrapper">
	<xsl:copy>
		<xsl:apply-templates select="@*|node()" mode="wrapper"/>
	</xsl:copy>
</xsl:template>

<xsl:template match="html:head" mode="wrapper">
	<xsl:copy>
		<xsl:apply-templates select="@*" mode="wrapper"/>
		<xsl:if test="not($top/html:html/html:head/html:title)">
			<xsl:copy-of select="html:title"/>
		</xsl:if>
		<xsl:apply-templates select="node()[not(self::html:title | self::html:script)]" mode="wrapper"/>
		<xsl:apply-templates select="$top/html:html/html:head/node()[not(self::html:script)]"/>
		<xsl:apply-templates select="html:script" mode="wrapper"/>
	</xsl:copy>
</xsl:template>

<xsl:template match="html:script" mode="wrapper">
	<xsl:copy-of select="." /><xsl:text>
</xsl:text>
</xsl:template>

<xsl:template match="html:script[not(@src) and (not(@type) or @type='text/javascript')]" mode="wrapper">
	<xsl:text disable-output-escaping="yes">&lt;script&gt;// &lt;![CDATA[
</xsl:text>
	<xsl:value-of select="text()" /><xsl:text disable-output-escaping="yes">
// ]]&gt;&lt;/script&gt;
</xsl:text>
</xsl:template>

<xsl:template match="//html:*[@role='main'][position()=1]" mode="wrapper">
	<xsl:copy>
		<xsl:if test="not($top//html:*[@role='main'])">
			<xsl:attribute name="role">main</xsl:attribute>
		</xsl:if>
		<xsl:apply-templates select="$top/html:html/html:body/@*"/>
		<xsl:apply-templates select="@*[not(name()='role')]" mode="wrapper"/>
		<xsl:apply-templates select="$top/html:html/html:body/node()"/>
	</xsl:copy>
</xsl:template>

</xsl:stylesheet>
