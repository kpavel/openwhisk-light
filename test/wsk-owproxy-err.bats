#!/usr/bin/env bats

load test_helper
export OWL_DELEGATE_ON_FAILURE=false
export OWL_HOST_CAPACITY=0

setup() {
  run npm start --prefix $BASE_DIR&
  run bash -c "sleep 2"
  run bash -c "wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js > /dev/null 2>&1"
}

teardown() {
  run npm stop --prefix $BASE_DIR
}

@test "wsk action invoke on zero capacity without delegation and check activation not created" {
  actid=`wsk -i action invoke owl-test -p aa BB | cut -d' ' -f 6`
  [ "$actid" = "" ]
}
