#!/usr/bin/env bats

DIR=$BATS_TEST_DIRNAME

setup() {
  load test_helper
  run npm start --prefix ../&
  run bash -c "sleep 2"
  run wsk -i action delete owl-test
}

teardown() {
  run npm stop --prefix ../
}

#teardown() {
#  run wsk -i action delete owl-test
#}

@test "wsk action create already existing" {
  run wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js 
  run wsk -i action create owl-test --kind nodejs:6 $DIR/owl-test.js 
  [ "$status" -eq 153 ]
}

@test "wsk action delete non-existent action" {
  run wsk -i action delete owl-non-existent-action
  [ "$status" -eq 148 ]
}

@test "wsk action get non-existent action" {
  run wsk -i action get owl-non-existent-action
  [ "$status" -eq 148 ]
}
