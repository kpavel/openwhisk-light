#!/usr/bin/env bats

setup() {
  load test_helper
  run npm start --prefix $BASE_DIR&
  run bash -c "sleep 2"
  run wsk -i action delete owl-test
}

teardown() {
  run wsk -i action delete owl-test
  run npm stop --prefix $BASE_DIR
}

@test "wsk action invoke owl-test non-blocking and check activation" {
  run bash -c "wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js > /dev/null 2>&1"
  actid=`wsk -i action invoke owl-test -p aa BB | cut -d' ' -f 6`
  echo $actid
  res=none
  for i in {1..5}; do res=`wsk -i activation result $actid | jq '.aa'` && test "$res" != "null" && break || sleep 1; done
  echo $res
  [ "$res" = "\"BB\"" ]
}

@test "wsk action invoke missing-action non-blocking and check activation not created" {
  actid=`wsk -i action invoke missing-action -p aa BB | cut -d' ' -f 6`
  echo actid:$actid
  [ "$actid" = "" ]
}

@test "wsk action invoke owl-test blocking and check logs" {
  run bash -c "wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js > /dev/null 2>&1"
  param="HelloWorld"
  actid=`wsk -i action invoke owl-test -b -p key $param| cut -d' ' -f 6|head -1`
  echo actid:$actid
  log=`wsk -i activation logs $actid` 
  [[ $log == *$param* ]]
}
