#!/bin/bash

API_TOKEN=""
USER_ID=""
BASE_URL="http://localhost:3000"

function help() {
    echo "Usage:"
    echo "./cli.sh authorize <userId>"
    echo "./cli.sh setApiToken <token>"
    echo "./cli.sh deleteUser"
    echo "./cli.sh getUser"
    echo "./cli.sh currentlyPlaying"
    echo "./cli.sh topTracks [amount]"
    echo "./cli.sh topArtists [amount]"
    echo "./cli.sh recentlyPlayed [amount]"
    echo "./cli.sh createPlaylist <month> <year> <playlistName>"
    echo "./cli.sh recommendations [genre] [recentlyPlayed] [mostPlayed] [likedSongs] [currentlyPlayingSong]"
}

function setApiToken() {
    token=$1
    sed -i "s/API_TOKEN=\".*\"/API_TOKEN=\"$token\"/" "$0"
}

function authorize() {
    userId=$1
    curl "$BASE_URL/authorize/$userId" & echo "Copy the token from the browser and run the following command: ./cli.sh setApiToken <token>" &
    sed -i "s/USER_ID=\".*\"/USER_ID=\"$userId\"/" "$0"
}

function deleteUser() {
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/delete-user/$USER_ID"
}

function getUser() {
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/user/$USER_ID" | jq '{display_name: .display_name, external_urls: .external_urls, followers: .followers, country: .country, product: .product, email: .email}'
}

function currentlyPlaying() {
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/currently-playing/$USER_ID" | jq '{name: .item.name, artists: [.item.artists[].name], album: .item.album.name, duration: .item.duration_ms, popularity: .item.popularity, external_urls: .item.external_urls, progress: .progress_ms, progress_bar: (("#" * (.progress_ms / .item.duration_ms * 100 | floor)) + ("-" * (100 - (.progress_ms / .item.duration_ms * 100 | floor))))}'
}

function topTracks() {
    amount=${1:-20}
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/top-tracks/$USER_ID?amount=$amount" | jq '.items[] | {name: .name, artists: [.artists[].name], album: .album.name, duration: .duration_ms, popularity: .popularity, external_urls: .external_urls}'
}

function topArtists() {
    amount=${1:-20}
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/top-artists/$USER_ID?amount=$amount" | jq '.items[] | {name: .name, genres: .genres, popularity: .popularity, external_urls: .external_urls}'
}

function recentlyPlayed() {
    amount=${1:-20}
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/recently-played/$USER_ID?amount=$amount" | jq '.items[] | {name: .track.name, artists: [.track.artists[].name], album: .track.album.name, duration: .track.duration_ms, played_at: .played_at, external_urls: .track.external_urls}'
}

function createPlaylist() {
    month=$1
    year=$2
    playlistName=$3

    if [ -z "$month" ] || [ -z "$year" ]; then
        echo "Error: You must provide a month and year."
        return 1
    fi

    curl -X POST -H "Content-Type: application/json" -H "x-api-key: $API_TOKEN" -d "{\"id\":\"$USER_ID\", \"month\":$month, \"year\":$year, \"playlistName\":\"$playlistName\"}" "$BASE_URL/create-playlist" | jq '{playlistId: .id, playlistName: .name, playlistUrl: .external_urls}'
}

function recommendations() {
    genre=${1:-""}
    recentlyPlayed=${2:-false}
    mostPlayed=${3:-true}
    likedSongs=${4:-true}
    currentlyPlayingSong=${5:-false}

    if [ "$recentlyPlayed" = false ] && [ "$mostPlayed" = false ] && [ "$likedSongs" = false ] && [ "$currentlyPlayingSong" = false ]; then
        echo "Error: You must select at least one option."
        return 1
    fi

    response=$(curl -s -X POST -H "Content-Type: application/json" -H "x-api-key: $API_TOKEN" -d "{\"id\":\"$USER_ID\", \"genre\":\"$genre\", \"recentlyPlayed\":$recentlyPlayed, \"mostPlayed\":$mostPlayed, \"likedSongs\":$likedSongs, \"currentlyPlaying\":$currentlyPlayingSong}" "$BASE_URL/recommendations")
    echo "$response" | jq -r '.tracks.items[] | {name: .track.name, artists: [.track.artists[].name], album: .track.album.name, duration: .track.duration_ms, external_urls: .track.external_urls}' | jq -s 'sort_by(.duration) | .[]'
    echo "Playlist URL: $(echo "$response" | jq -r '.external_urls.spotify')"
}


if [ "$1" == "help" ]; then
    help
else
    "$@"
fi