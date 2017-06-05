#!/usr/bin/env bats

@test "wsk property get" {
  run wsk -i property get
  [ "$status" -eq 0 ]
}

