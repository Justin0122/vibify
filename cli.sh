#!/bin/bash

API_TOKEN=""
BASE_URL="http://localhost:3000"

function help() {
    echo "Usage:"
    echo "./cli.sh authorize <userId>"
    echo "./cli.sh setApiToken <token>"
    echo "./cli.sh deleteUser <userId>"
    echo "./cli.sh getUser <userId>"
    echo "./cli.sh currentlyPlaying <userId>"
    echo "./cli.sh topTracks <userId> <amount>"
    echo "./cli.sh topArtists <userId> <amount>"
    echo "./cli.sh recentlyPlayed <userId> <amount>"
    echo "./cli.sh createPlaylist <userId> <month> <year> <playlistName>"
    echo "./cli.sh recommendations <userId> <genre> <recentlyPlayed> <mostPlayed> <likedSongs>"
}

function setApiToken() {
    token=$1
    sed -i "s/API_TOKEN=\".*\"/API_TOKEN=\"$token\"/" "$0"
}

function authorize() {
    userId=$1
    curl "$BASE_URL/authorize/$userId" & echo "Copy the token from the browser and run the following command: ./cli.sh setApiToken <token>"
}

function deleteUser() {
    userId=$1
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/delete-user/$userId"
}

function getUser() {
    userId=$1
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/user/$userId" | jq '{display_name: .display_name, external_urls: .external_urls, followers: .followers, country: .country, product: .product, email: .email}'
}

function currentlyPlaying() {
    userId=$1
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/currently-playing/$userId" | jq '{name: .item.name, artists: [.item.artists[].name], album: .item.album.name, duration: .item.duration_ms, popularity: .item.popularity, external_urls: .item.external_urls, progress: .progress_ms, progress_bar: (("#" * (.progress_ms / .item.duration_ms * 100 | floor)) + ("-" * (100 - (.progress_ms / .item.duration_ms * 100 | floor))))}'
}

function topTracks() {
    userId=$1
    amount=${2:-20}
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/top-tracks/$userId?amount=$amount" | jq '.items[] | {name: .name, artists: [.artists[].name], album: .album.name, duration: .duration_ms, popularity: .popularity, external_urls: .external_urls}'
}

function topArtists() {
    userId=$1
    amount=${2:-20}
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/top-artists/$userId?amount=$amount" | jq '.items[] | {name: .name, genres: .genres, popularity: .popularity, external_urls: .external_urls}'
}

function recentlyPlayed() {
    userId=$1
    amount=${2:-20}
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/recently-played/$userId?amount=$amount" | jq '.items[] | {name: .track.name, artists: [.track.artists[].name], album: .track.album.name, duration: .track.duration_ms, played_at: .played_at, external_urls: .track.external_urls}'
}

function createPlaylist() {
    userId=$1
    month=$2
    year=$3
    playlistName=$4
    curl -X POST -H "Content-Type: application/json" -H "x-api-key: $API_TOKEN" -d "{\"id\":\"$userId\", \"month\":$month, \"year\":$year, \"playlistName\":\"$playlistName\"}" "$BASE_URL/create-playlist" | jq '{playlistId: .id, playlistName: .name, playlistUrl: .external_urls}'
}

function recommendations() {
    userId=$1
    genre=${2:-""}
    recentlyPlayed=${3:-false}
    mostPlayed=${4:-true}
    likedSongs=${5:-true}
    curl -X POST -H "Content-Type: application/json" -H "x-api-key: $API_TOKEN" -d "{\"id\":\"$userId\", \"genre\":\"$genre\", \"recentlyPlayed\":$recentlyPlayed, \"mostPlayed\":$mostPlayed, \"likedSongs\":$likedSongs}" "$BASE_URL/recommendations" | jq '.tracks.items[] | {name: .track.name, artists: [.track.artists[].name], album: .track.album.name, duration: .track.duration_ms, added_at: .added_at, external_urls: .track.external_urls}'
}

if [ "$1" == "help" ]; then
    help
else
    "$@"
fi