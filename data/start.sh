# change aws creds
vim ~/.aws/credentials

# prepare match data
. ./venv/bin/activate
cd data/loader
python main.py

# start game
curl -X POST \
     https://1jmrjvnbs5.execute-api.eu-central-1.amazonaws.com/prod/admin/matches/DFL-MAT-111111/start \
     -H "x-api-key: JPXUjucTlj6t45lnrnCQ96vD2LuIcKrc3A9Vpl3E" \
     -H "Content-Type: application/json" \
     -d '{"speedMultiplier": 30}'