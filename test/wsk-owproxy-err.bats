#!/usr/bin/env bats

DIR=$BATS_TEST_DIRNAME
load test_helper
export DELEGATE_ON_FAILURE=false

setup() {
  run npm start --prefix ../&
  run bash -c "sleep 2"
  run bash -c "wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js > /dev/null 2>&1"
}

teardown() {
  run npm stop --prefix ../
}

@test "wsk action invoke on zero capacity without delegation and check activation not created" {
  actid=`wsk -i action invoke owl-test -p aa BB | cut -d' ' -f 6`
  echo $actid
#  res=none
#  run bash -c "wsk -i activation get $actid | jq '.aa'"
#  for i in {1..5}; do res=`wsk -i activation result $actid | jq '.aa'` && test "$res" != "null" && break || sleep 1; done
#  echo $res
#  [ "$res" = "\"BB\"" ]
  echo actid:$actid
  [ "$actid" = "" ]
}
