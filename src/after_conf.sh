#!/bin/sh
while pgrep -f "bt_confirm.js $1|bt_confirm.js $2|after_pairs.sh $1 $2" > /dev/null; do sleep 20; done
for s in $1 $2; do node bt_pairs3.js $s 113 128; done
