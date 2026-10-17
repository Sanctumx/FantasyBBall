#!/bin/sh
for s in $1 $2; do node bt_known.js $s 113 128; done
for s in $1 $2; do node bt_look2.js $s 113 128; done
for s in $1 $2; do node bt_pairs2.js $s 113 128; done
