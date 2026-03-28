#!/bin/bash
# Kill all processes listening on a given port AND their parent watch processes
PORT=$1
if [ -z "$PORT" ]; then echo "Usage: kill-port.sh <port>"; exit 1; fi

PIDS=$(lsof -ti :"$PORT" 2>/dev/null)
if [ -n "$PIDS" ]; then
  ALL_PIDS="$PIDS"
  for pid in $PIDS; do
    PARENT=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    if [ -n "$PARENT" ] && [ "$PARENT" != "1" ] && [ "$PARENT" != "0" ]; then
      ALL_PIDS="$ALL_PIDS $PARENT"
    fi
  done
  ALL_PIDS=$(echo "$ALL_PIDS" | tr ' ' '\n' | sort -u | tr '\n' ' ')
  echo "Killing PIDs on port $PORT: $ALL_PIDS"
  echo "$ALL_PIDS" | xargs kill -9 2>/dev/null
  sleep 1
else
  echo "Port $PORT is free"
fi
