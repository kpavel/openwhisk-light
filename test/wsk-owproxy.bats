#!/usr/bin/env bats

DIR=$BATS_TEST_DIRNAME
export DOCKER_HOST=tcp://0.0.0.0:2375
export OW_LOCAL_DOCKER_NW_NAME=owl
export TOTAL_CAPACITY=0
export DELEGATE_ON_FAILURE=true
export RETRIES=0

setup() {
  run npm start --prefix ../>2&
  run sleep 5
}

teardown() {
  run npm stop --prefix ../
}

@test "wsk action invoke on owproxy and check activation created" {
  run bash -c "wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js > /dev/null 2>&1"
  actid=`wsk -i action invoke owl-test -p aa BB | cut -d' ' -f 6`
  echo $actid
  res=none
  for i in {1..5}; do res=`wsk -i activation result $actid | jq '.aa'` && test "$res" != "null" && break || sleep 1; done
  echo $res
  [ "$res" = "\"BB\"" ]
}
