<?xml version="1.0" encoding="UTF-8"?>
<!-- Copyright 2009-2010 Sean Hogan (http://meekostuff.net/) -->

<xsl:stylesheet version="1.0" exclude-result-prefixes="xsl html xbl"
	xmlns:xbl="http://www.w3.org/ns/xbl"
	xmlns:html="http://www.w3.org/1999/xhtml"
	xmlns="http://www.w3.org/1999/xhtml"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:dyn="http://exslt.org/dynamic"
	xmlns:str="http://exslt.org/strings"
	extension-element-prefixes="dyn str">

<xsl:output method="xml" omit-xml-declaration="yes" 
	doctype-public="-//W3C//DTD XHTML 1.0 Transitional//EN"/>

<xsl:template match="@*|node()">
	<xsl:copy>
		<xsl:apply-templates select="@*|node()"/>
	</xsl:copy>
</xsl:template>

<xsl:template match="html:head">
	<xsl:copy>
		<xsl:apply-templates select="@*"/>
		<xsl:for-each select="str:split($SCRIPT_URLS)">
<script src="{string()}"></script>
		</xsl:for-each>
		<xsl:apply-templates select="node()"/>
		<xsl:for-each select="str:split($POST_SCRIPT_URLS)">
<script src="{string()}"></script>
		</xsl:for-each>
	</xsl:copy>
</xsl:template>

<xsl:template match="xbl:xbl">
<style type="application/xml">
	<xsl:copy>
		<xsl:apply-templates select="@*|node()"/>
	</xsl:copy>
</style>
</xsl:template>

<xsl:template match="html:form/@action | html:*/@src | html:*/@href | xbl:*/@src | xbl:*/@extends">
        <xsl:variable name="name" select="name()"/>
        <xsl:attribute name="{$name}">
                <xsl:call-template name="href_template">
                        <xsl:with-param name="input" select="string()"/>
                </xsl:call-template>
        </xsl:attribute>
</xsl:template>

<xsl:template name="href_template">
<xsl:param name="input"/>
<xsl:variable name="before" select="substring-before($input, '{')"/>
<xsl:variable name="after" select="substring-after($input, '{')"/>
<xsl:choose>
	<xsl:when test="$after">
		<xsl:value-of select="$before"/>
		<xsl:call-template name="href_template_param">
			<xsl:with-param name="input" select="$after"/>
		</xsl:call-template>
	</xsl:when>
	<xsl:otherwise>
		<xsl:value-of select="$input"/>
	</xsl:otherwise>
</xsl:choose>
</xsl:template>

<xsl:template name="href_template_param">
<xsl:param name="input"/>
<xsl:variable name="before" select="substring-before($input, '}')"/>
<xsl:variable name="after" select="substring-after($input, '}')"/>
<xsl:if test="$before">
	<xsl:value-of select="dyn:evaluate(concat('$', $before))"/>
</xsl:if>
<xsl:if test="$after">
	<xsl:call-template name="href_template">
		<xsl:with-param name="input" select="$after"/>
	</xsl:call-template>
</xsl:if>
</xsl:template>

</xsl:stylesheet>
