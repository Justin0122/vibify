#!/bin/bash

API_TOKEN="${VIBIFY_API_TOKEN}"
BASE_URL="https://vibify.justinjongstra.nl"

function help() {
    echo "Usage:"
    echo "./cli.sh authorize <userId>"
    echo "./cli.sh setApiToken <token>"
    echo "./cli.sh deleteUser <userId>"
    echo "./cli.sh getUser <userId>"
    echo "./cli.sh currentlyPlaying <userId>"
    echo "./cli.sh topTracks <userId>"
    echo "./cli.sh topArtists <userId>"
    echo "./cli.sh recentlyPlayed <userId>"
    echo "./cli.sh createPlaylist <userId> <month> <year> <playlistName>"
    echo "./cli.sh recommendations <userId> <genre> <recentlyPlayed> <mostPlayed> <likedSongs>"
}

function setApiToken() {
    token=$1
    echo "export VIBIFY_API_TOKEN=$token"
}

function authorize() {
    userId=$1
    curl "$BASE_URL/authorize/$userId"
}

function deleteUser() {
    userId=$1
    curl -X POST -H "x-api-key: $API_TOKEN" -d "{\"id\":\"$userId\"}" "$BASE_URL/delete-user"
}

function getUser() {
    userId=$1
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/user/$userId"
}

function currentlyPlaying() {
    userId=$1
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/currently-playing/$userId"
}

function topTracks() {
    userId=$1
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/top-tracks/$userId"
}

function topArtists() {
    userId=$1
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/top-artists/$userId"
}

function recentlyPlayed() {
    userId=$1
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/recently-played/$userId"
}

function createPlaylist() {
    userId=$1
    month=$2
    year=$3
    playlistName=$4
    curl -X POST -H "x-api-key: $API_TOKEN" -d "{\"id\":\"$userId\", \"month\":\"$month\", \"year\":\"$year\", \"playlistName\":\"$playlistName\"}" "$BASE_URL/create-playlist"
}

function recommendations() {
    userId=$1
    genre=$2
    recentlyPlayed=$3
    mostPlayed=$4
    likedSongs=$5
    curl -X POST -H "x-api-key: $API_TOKEN" -d "{\"id\":\"$userId\", \"genre\":\"$genre\", \"recentlyPlayed\":$recentlyPlayed, \"mostPlayed\":$mostPlayed, \"likedSongs\":$likedSongs}" "$BASE_URL/recommendations"
}

if [ "$1" == "help" ]; then
    help
else
    "$@"
fi