#!/usr/bin/env bats

setup() {
  load test_helper
  run npm start --prefix ../&
  run bash -c "sleep 2"
}

teardown() {
  run npm stop --prefix ../
}

@test "wsk property get" {
  run wsk -i property get
  [ "$status" -eq 0 ]
}

