#!/usr/bin/perl
use Cwd;
$PWD = getcwd();
$XSLTPROC = "/usr/bin/xsltproc --novalid --nonet";
#$TIDY = "/usr/bin/tidy -asxhtml -q --tidy-mark no";
$BINPATH = `dirname $0`;
chomp $BINPATH;
$TIDY = "$XSLTPROC --html $BINPATH/xhtml2xhtml.xsl";
$TEMPLATE = "$0.xsl";
$PARAMS = {};
$DECOR = "";
$IS_HTML = 0;
$VERBOSE = 0;
$SRC = "";

my $usage = "$0 [--decor decorURL] file\n";

my $n = scalar @ARGV;
for (my $i=0; $i<$n; $i++) {
	my $arg = $ARGV[$i];
	if ("--help" eq $arg || "-?" eq $arg) {
		print STDERR $usage;
		exit 1;
	}
	elsif ("--decor" eq $arg) {
		my $uri = $ARGV[++$i];
		$DECOR = $uri;
		next;
	}
	elsif ("--html" eq $arg) {
		$IS_HTML = 1;
		next;
	}
	elsif ("--verbose" eq $arg) {
		$VERBOSE = 1;
		next;
	}
	elsif ($arg =~ /^-.+/) {
		print STDERR "Illegal option " . $arg . "\n" . "Usage:" . $usage;
		exit 1;
	}
	
	else {
		if (!$SRC) { $SRC = $arg; }
		else {
			print STDERR "Cannot process more than one file.\nUsage: " . $usage;
			quit();
		}
	}
}

$SRCPATH = `dirname $SRC`;
chomp $SRCPATH;

$OUTARGS = "";
$OUTARGS .= "--stringparam DECOR_URL \"" . $DECOR . "\" ";

my $execStr = ($IS_HTML) ? "$TIDY $SRC | " : "";
$execStr .= "$XSLTPROC --path $SRCPATH --path $PWD $OUTARGS $TEMPLATE ";
$execStr .= ($IS_HTML) ? "-" : "$SRC";
$VERBOSE and print STDERR "$execStr\n";
system($execStr);
