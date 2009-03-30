#!/usr/bin/perl
use Cwd;
use IPC::Open2;
$PWD = getcwd();
$XSLTPROC = "/usr/bin/xsltproc --novalid --nonet";
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
#system("$XSLTPROC --path $SRCPATH --path $PWD $PARAMS $TEMPLATE $SRC");
open2($rd, $wr, "$XSLTPROC --path $SRCPATH --path $PWD $PARAMS - $SRC");
while (<main::DATA>) {
	print $wr $_;
}
close $wr;
$output = do { local $/; <$rd>; };
close $rd;
print $output;
exit $?;
__DATA__
