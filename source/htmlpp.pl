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
$SCRIPTS = [];
$POST_SCRIPTS = [];
$IS_HTML = 0;
$VERBOSE = 0;
$SRC = "";

my $usage = "$0 [--script scriptURL] [--post-script scriptURL] [--stringparam name value] file\n";

my $n = scalar @ARGV;
for (my $i=0; $i<$n; $i++) {
	my $arg = $ARGV[$i];
	if ("--help" eq $arg || "-?" eq $arg) {
		print STDERR $usage;
		exit 1;
	}
	elsif ("--stringparam" eq $arg) {
		my $name = $ARGV[++$i];
		my $value = $ARGV[++$i];
		$PARAMS->{$name} = $value;
		next;
	}
	elsif ("--script" eq $arg) {
		my $uri = $ARGV[++$i];
		push @{$SCRIPTS}, $uri;
		next;
	}
	elsif ("--post-script" eq $arg) {
		my $uri = $ARGV[++$i];
		push @{$POST_SCRIPTS}, $uri;
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
for my $name (keys %{$PARAMS}) {
	my $value = $PARAMS->{$name};
	$OUTARGS .= "--stringparam $name \"$value\" ";
}
$OUTARGS .= "--stringparam SCRIPT_URLS \"" . join(" ", @{$SCRIPTS}) . "\" ";
$OUTARGS .= "--stringparam POST_SCRIPT_URLS \"" . join(" ", @{$POST_SCRIPTS}) . "\" ";

my $execStr = ($IS_HTML) ? "$TIDY $SRC | " : "";
$execStr .= "$XSLTPROC --path $SRCPATH --path $PWD $OUTARGS $TEMPLATE ";
$execStr .= ($IS_HTML) ? "-" : "$SRC";
$VERBOSE and print STDERR "$execStr\n";
system($execStr);
