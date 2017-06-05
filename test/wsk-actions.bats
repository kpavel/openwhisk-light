#!/usr/bin/env bats

DIR=$BATS_TEST_DIRNAME

setup() {
  run wsk -i action delete owl-test
}

#teardown() {
#  run wsk -i action delete owl-test
#}

@test "wsk action create" {
  run wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js 
  [ "$status" -eq 0 ]
}

@test "wsk action delete" {
  run wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js 
  sleep 1
  run wsk -i action delete owl-test
  [ "$status" -eq 0 ]
}

@test "wsk action invoke owl-test" {
  run bash -c "wsk -i action create owl-test --kind nodejs:6 $DIR/owl-test.js > /dev/null 2>&1"
  run bash -c "wsk -i action invoke owl-test -r -p aa BB | jq '.aa'"
  echo $output
  [ "$output" = "\"BB\"" ]
}

@test "wsk action invoke echo" {
  run bash -c "wsk -i action invoke /whisk.system/utils/echo -r -p aa BB | jq '.aa'"
  echo $output
  [ "$output" = "\"BB\"" ]
}

