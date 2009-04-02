#!/usr/bin/perl
use Cwd;
$PWD = getcwd();
$XSLTPROC = "/usr/bin/xsltproc --novalid --nonet";
$TEMPLATE = "$0.xsl";
$PARAMS = {};
$WRAPPER = "";
$SRC = "";

my $usage = "$0 [--wrapper wrapperURL] file\n";

my $n = scalar @ARGV;
for (my $i=0; $i<$n; $i++) {
	my $arg = $ARGV[$i];
	if ("--help" eq $arg || "-?" eq $arg) {
		print STDERR $usage;
		exit 1;
	}
	elsif ("--wrapper" eq $arg) {
		my $uri = $ARGV[++$i];
		$WRAPPER = $uri;
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
$OUTARGS .= "--stringparam WRAPPER_URL \"" . $WRAPPER . "\" ";

print STDERR "$XSLTPROC --path $SRCPATH --path $PWD $OUTARGS $TEMPLATE $SRC";
system("$XSLTPROC --path $SRCPATH --path $PWD $OUTARGS $TEMPLATE $SRC");
