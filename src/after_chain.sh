#!/bin/sh
# wait for this worker's run_chain to finish, then run the look-ahead test for its seasons
while pgrep -f "run_chain.sh $1 $2" > /dev/null; do sleep 20; done
for s in $1 $2; do node bt_look2.js $s 113 128; done
