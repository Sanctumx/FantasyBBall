#!/bin/sh
while pgrep -f "after_chain.sh $1 $2" > /dev/null; do sleep 20; done
for s in $1 $2; do node bt_pairs2.js $s 113 128; done
