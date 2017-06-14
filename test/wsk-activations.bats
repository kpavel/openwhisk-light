#!/usr/bin/env bats

DIR=$BATS_TEST_DIRNAME

setup() {
  run wsk -i action delete owl-test
}

#teardown() {
#  run wsk -i action delete owl-test
#}

@test "wsk action invoke owl-test non-blocking and check activation" {
  run bash -c "wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js > /dev/null 2>&1"
  actid=`wsk -i action invoke owl-test -p aa BB | cut -d' ' -f 6`
  echo $actid
  res=none
  for i in {1..5}; do res=`wsk -i activation result $actid | jq '.aa'` && test "$res" != "null" && break || sleep 1; done
  echo $res
  [ "$res" = "\"BB\"" ]
}

