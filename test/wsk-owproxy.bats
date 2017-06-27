#!/usr/bin/env bats

load test_helper

setup() {
  run npm start --prefix $BASE_DIR&
  run bash -c "sleep 2"
}

teardown() {
  run wsk -i action delete owl-test
  run npm stop --prefix $BASE_DIR
}

@test "wsk action invoke on owproxy and check activation created" {
  run bash -c "wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js > /dev/null 2>&1"
  actid=`wsk -i action invoke owl-test -p aa BB | cut -d' ' -f 6`
  echo $actid
  res=none
#  run bash -c "wsk -i activation get $actid | jq '.aa'"
  for i in {1..5}; do res=`wsk -i activation result $actid | jq '.aa'` && test "$res" != "null" && break || sleep 1; done
  echo $res
  [ "$res" = "\"BB\"" ]
}
