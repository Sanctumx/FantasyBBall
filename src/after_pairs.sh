#!/bin/sh
while pgrep -f "run_rest.sh $1 $2" > /dev/null; do sleep 20; done
for s in $1 $2; do node bt_confirm.js $s 129 144; done
