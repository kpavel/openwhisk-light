#!/usr/bin/env bats

load test_helper
export OWL_DELEGATE_ON_FAILURE=false
export OWL_HOST_CAPACITY=5
export OWL_PREEMPTION_ENABLED=true
export OWL_PREEMPTION_PERIOD=15
export OWL_PREEMPTION_LOW=0.25
export OWL_PREEMPTION_HIGH=0.75

setup() {
  run npm start --prefix $BASE_DIR&

  # long sleep to wait for containers cleanup
  run bash -c "sleep 20"
}

teardown() {
  for (( i=0; i<$OWL_HOST_CAPACITY; i++ )); do
      wsk -i action delete owl-test-$i > /dev/null 2>&1
  done
  wsk -i action delete owl-sleep-test > /dev/null 2>&1
  run npm stop --prefix $BASE_DIR
}

########
# register action with sleep
# invoke action without blocking to hang for SLEEP_MILLISECONDS
# update action
# wait for TIME > SLEEP_MILLISECONDS and check activations result
# validate action container been removed
@test "wsk validate action deprecation" {
  containersNum=`docker ps|grep nodejs6action|wc -l`
  [ "$containersNum" = "0" ]

  SLEEP_MILLISECONDS=10000

  run bash -c "wsk -i action update owl-sleep-test --kind nodejs:6 $DIR/owl-sleep-test.js > /dev/null 2>&1"

  sleep 1
  actid=`wsk -i action invoke owl-sleep-test -p timeout $SLEEP_MILLISECONDS | cut -d' ' -f 6`
  echo actid:$actid

  run bash -c "wsk -i action update owl-sleep-test > /dev/null 2>&1"
  run bash -c "wsk -i action get owl-sleep-test > /dev/null 2>&1"

  sleep $(($SLEEP_MILLISECONDS * 2 / 1000))
  containersNum=`docker ps|grep nodejs6action|wc -l`
  [ "$containersNum" = "0" ]

  res=`wsk -i activation result $actid | jq .'timeout'`
  echo res:$res
  [ "$res" = "$SLEEP_MILLISECONDS" ]
}

########
# register HOST_CAPACITY action with sleep
# invoke HOST_CAAPCITY number of actions without blocking to hang
#   for SLEEP_MILLISECONDS and store their activations ids
# update all the actions above (update + get)
# wait for TIME > OWL_PREEMPTION_TIME < SLEEP_MILLISECONDS and 
#   validate that containers not been preempted
# wait for TIME > SLEEP_MILLISECONDS and check activations result
# check containers been preempted
#
@test "wsk busy action deprecation and preemption" {
  containersNum=`docker ps|grep nodejs6action|wc -l`
  [ "$containersNum" = "0" ]

  SLEEP_MILLISECONDS=$((1000 * 3 * $OWL_PREEMPTION_PERIOD))

  run bash -c "wsk -i action update owl-sleep-test --kind nodejs:6 $DIR/owl-sleep-test.js"
  declare -a activations

  sleep 1
  for (( i=0; i<$OWL_HOST_CAPACITY; i++ )); do
    echo "runing wsk -i action invoke owl-sleep-test -p timeout $SLEEP_MILLISECONDS"
    activations[$i]=`wsk -i action invoke owl-sleep-test -p timeout $SLEEP_MILLISECONDS | cut -d' ' -f 6` > /dev/null 2>&1
  done

  sleep 1
  run bash -c "wsk -i action update owl-sleep-test > /dev/null 2>&1"
  run bash -c "wsk -i action get owl-sleep-test > /dev/null 2>&1"

  sleep $(($OWL_PREEMPTION_PERIOD * 2))
  containersNum=`docker ps|grep nodejs6action|wc -l`
  echo "containersNum:$containersNum"
  echo "OWL_HOST_CAPACITY:$OWL_HOST_CAPACITY"
  [ "$containersNum" = "$OWL_HOST_CAPACITY" ]

  sleep $(($OWL_PREEMPTION_PERIOD * 4))
  containersNum=`docker ps|grep nodejs6action|wc -l`
  [ "$containersNum" = "0" ]

  for actid in ${activations[@]}; do
    res=`wsk -i activation result $actid`
    echo "res1: $res"
  done

  for actid in ${activations[@]}; do
    res=`wsk -i activation result $actid | jq .'timeout'`; echo "res2: $res"; [ "$res" = "$SLEEP_MILLISECONDS" ]
  done
}

###############################
# register 5 different actions
# validate from docker that there no relevant running containers
# invoke 5 actions
# validate from docker that there 5 relevant running containers
# wait for a little bit more than preemption period
# validate from docker that there 2 relevant running containers now
@test "wsk action consume all capacity without delegation and validate action containers been preempted" {
  containersNum=`docker ps|grep nodejs6action|wc -l`
  [ "$containersNum" = "0" ]
  for (( i=0; i<$OWL_HOST_CAPACITY; i++ )); do
    echo "runing wsk -i action update owl-test-$i --kind nodejs:6 $DIR/owl-test.js"
    wsk -i action update owl-test-$i --kind nodejs:6 $DIR/owl-test.js > /dev/null 2>&1
  done

  for (( i=0; i<$OWL_HOST_CAPACITY; i++ )); do
    echo "runing wsk -i action invoke owl-test-$i"
    wsk -i action invoke owl-test-$i > /dev/null 2>&1
  done

  sleep 1
  containersNum=`docker ps|grep nodejs6action|wc -l`
  [ "$containersNum" = "$OWL_HOST_CAPACITY" ]

  echo "OWL_PREEMPTION_PERIOD: $OWL_PREEMPTION_PERIOD"
  sleep $(($OWL_PREEMPTION_PERIOD * 4))
  containersNum=`docker ps|grep nodejs6action|wc -l`
  echo containersNum:$containersNum
  actualNum=$(expr $OWL_HOST_CAPACITY*$OWL_PREEMPTION_LOW | bc)
  actualNum=${actualNum%.*}
  echo actualNum:$actualNum
  [ "$containersNum" = "$actualNum" ]
}

