<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" exclude-result-prefixes="xsl html"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:html="http://www.w3.org/1999/xhtml"
	xmlns="http://www.w3.org/1999/xhtml">

<xsl:output method="xml" omit-xml-declaration="yes" cdata-section-elements=""
	doctype-public="-//W3C//DTD XHTML 1.0 Transitional//EN"/>
<xsl:variable name="top" select="/" />
<xsl:param name="DECOR_URL"/>
<xsl:variable name="DECOR_LINK" select="html:html/html:head/html:link[@rel='decor'][1]"/>

<xsl:variable name="decor">
	<xsl:choose>
		<xsl:when test="$DECOR_URL"><xsl:value-of select="$DECOR_URL"/></xsl:when>
		<xsl:when test="$DECOR_LINK"><xsl:value-of select="$DECOR_LINK/@href"/></xsl:when>
		<xsl:otherwise>
			<xsl:message terminate="yes">No decor URL given</xsl:message>
		</xsl:otherwise>
	</xsl:choose>
</xsl:variable>

<xsl:template match="@*|node()">
	<xsl:copy>
		<xsl:apply-templates select="@*|node()"/>
	</xsl:copy>
</xsl:template>

<xsl:template match="/">
	<xsl:apply-templates select="document($decor)" mode="decor" />
</xsl:template>

<xsl:template match="html:link[@rel='decor']"/>

<xsl:template match="@*|node()" mode="decor">
	<xsl:copy>
		<xsl:apply-templates select="@*|node()" mode="decor"/>
	</xsl:copy>
</xsl:template>

<xsl:template match="html:head" mode="decor">
	<xsl:copy>
		<xsl:apply-templates select="@*" mode="decor"/>
		<xsl:if test="not($top/html:html/html:head/html:title)">
			<xsl:copy-of select="html:title"/>
		</xsl:if>
		<xsl:apply-templates select="node()[not(self::html:title | self::html:script)]" mode="decor"/>
		<xsl:apply-templates select="$top/html:html/html:head/node()[not(self::html:script)]"/>
		<xsl:apply-templates select="html:script" mode="decor"/>
	</xsl:copy>
</xsl:template>

<xsl:template match="html:script" mode="decor">
	<xsl:copy-of select="." /><xsl:text>
</xsl:text>
</xsl:template>

<xsl:template match="html:script[not(@src) and (not(@type) or @type='text/javascript')]" mode="decor">
	<xsl:text disable-output-escaping="yes">&lt;script&gt;// &lt;![CDATA[
</xsl:text>
	<xsl:value-of select="text()" /><xsl:text disable-output-escaping="yes">
// ]]&gt;&lt;/script&gt;
</xsl:text>
</xsl:template>

<xsl:template match="//html:*[@role='main'][position()=1]" mode="decor">
	<xsl:copy>
		<xsl:if test="not($top//html:*[@role='main'])">
			<xsl:attribute name="role">main</xsl:attribute>
		</xsl:if>
		<xsl:apply-templates select="$top/html:html/html:body/@*"/>
		<xsl:apply-templates select="@*[not(name()='role')]" mode="decor"/>
		<xsl:apply-templates select="$top/html:html/html:body/node()"/>
	</xsl:copy>
</xsl:template>

</xsl:stylesheet>
