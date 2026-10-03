#!/bin/sh
# Lists every $var: reference under f/ that has no variable in the workspace. After a rebuild these are the secrets to re-enter.
set -eu
base_url=$1 workspace=$2 token=$3

missing=0
for path in $(grep -rhoE '\$var:[A-Za-z0-9_/.-]+' f | sed 's/^\$var://' | sort -u); do
  exists=$(curl -sS --fail-with-body -H "Authorization: Bearer $token" "$base_url/api/w/$workspace/variables/exists/$path")
  if [ "$exists" != true ]; then
    echo "missing variable: $path"
    missing=1
  fi
done
exit $missing
