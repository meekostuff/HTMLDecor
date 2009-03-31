#!/usr/bin/perl
use Cwd;
$PWD = getcwd();
$XSLTPROC = "/usr/bin/xsltproc --novalid --nonet";
$TEMPLATE = "$0.xsl";
$SRC = $ARGV[$#ARGV];
$SRCPATH = `dirname $SRC`;
chomp $SRCPATH;
$PARAMS = "";
$n = $#ARGV - 1;
for $i (0 .. $n) {
	$ARG = $ARGV[$i];
	$PARAMS .= ("" eq $ARG || $ARG =~ /\s/) ? "'$ARG'" : $ARG;
	$PARAMS .= " ";
}
system("$XSLTPROC --path $SRCPATH --path $PWD $PARAMS $TEMPLATE $SRC");
