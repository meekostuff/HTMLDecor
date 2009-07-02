#!/usr/bin/perl
use warnings;
use strict;
use Cwd;
use File::Basename;
use FindBin;

# Preset variables
our $top_builddir = getcwd;
our $top_srcdir = $FindBin::RealBin;
our $builddir = $top_builddir;
our $srcdir = $top_srcdir;
our $cfg_fname = "make.conf";

# Predeclared subroutines
sub process_dir($);
sub process_file($);
sub get_subdirs();

process_dir("");

my $reconfigureScript = <<"";
#!/bin/sh
$top_srcdir/configure

my $reconfigureBin = "$top_builddir/reconfigure";
`echo "$reconfigureScript" > $reconfigureBin && chmod +x $reconfigureBin`;
exit;

sub process_dir($) {

my $reldir = shift;
$builddir = $top_builddir;
$builddir .= "/" . $reldir if $reldir;
$srcdir = $top_srcdir;
$srcdir .= "/" . $reldir if $reldir;

if (! -d $builddir) {
	mkdir $builddir || die "Error creating $builddir directory";
}

my @input_files = split(/\s+/, `ls ${srcdir}`);

for (@input_files) {
	/(.+)\.in$/ or next;
	process_file($1);	
}

my @subdirs = get_subdirs();
foreach my $dir (@subdirs) {
	my $subreldir = ($reldir) ? $reldir . "/" : "";
	$subreldir .= $dir;
	process_dir($subreldir);
}

}


sub process_file($) {

my $fname = shift;
my $infile = $srcdir . "/$fname.in";
open(IN, "< " . $infile) || die "Error opening $infile";

my $outfile = $builddir . "/$fname";
open(OUT, "> " . $outfile) || die "Error opening $outfile";

print OUT <<"EOF" if $fname eq "Makefile";
-include $top_srcdir/$cfg_fname
-include $top_builddir/$cfg_fname
EOF

my %vars = (
	top_builddir => $top_builddir,
	top_srcdir => $top_srcdir,
	builddir => $builddir,
	srcdir => $srcdir
);

while (<IN>) {
	/\@(\w+)\@/ and do {
		my $name = $1;
		my $value = $vars{$name} || "";
		s/\@${name}\@/${value}/eg;
	};
	print OUT;
}

close IN;
close OUT;

}


sub get_subdirs() {

my $Makefile = << 'EOF';
include Makefile

VAR:
	@echo ${${VAR}}
EOF

my $cmd = "echo '$Makefile' | make -C $builddir -f - VAR=SUBDIRS VAR";
my $text = `$cmd`;
return split(/\s+/, $text);
}

