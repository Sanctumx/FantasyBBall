#!/bin/sh
# $1 $2 = two seasons for this worker
for s in $1 $2; do node bt_retest.js $s 113 128; done
for s in $1 $2; do node bt_upside.js $s 113 128; done
for s in $1 $2; do node bt_known.js $s 113 128; done
