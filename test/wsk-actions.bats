#!/usr/bin/env bats


load test_helper

setup() {
  run npm start --prefix $BASE_DIR&
  run bash -c "sleep 2"
  run wsk -i action delete owl-test
}

teardown() {
  run npm stop --prefix $BASE_DIR
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

@test "wsk action get" {
  run wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js
  diff <(wsk action get owl-test|  	# action JSON from OpenWhisk
    tail -n +2|  			# remove first line comprising "ok: got action ..."
    jq '.exec.code' | tr -d '[\"]'| 	# retrieve .exec.code field from JSON, without \"
    sed -e 's/\\n/\n/g'| 		# replace \n with "real" new-line
    tr -d '[:space:]')			`# remove white spaces`\
    <(cat $DIR/owl-test.js | tr -d '[:space:]')	# original action file without white spaces
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

@test "wsk action update owl-test" {
  run bash -c "wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js  > /dev/null 2>&1"
  run bash -c "wsk -i action invoke owl-test -r | jq '.hello'"
  echo $output
  [ $output = null ]
  run bash -c "wsk -i action update owl-test --kind nodejs:6 $DIR/owl-test.js -p hello world > /dev/null 2>&1"
  run bash -c "wsk -i action invoke owl-test -r | jq '.hello'"
  echo $output
  [ "$output" = "\"world\"" ]
}
