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
    echo "./cli.sh recommendations [genre] [recentlyPlayed] [mostPlayed] [likedTracks] [currentlyPlayingSong]"
}

function checkIfUserIdIsSet() {
    if [ -z "$USER_ID" ]; then
        echo "Error: User ID is not set. Run the following command to set the user ID: ./cli.sh authorize <userId>"
        return 1
    fi
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
    checkIfUserIdIsSet
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/delete-user/$USER_ID" & sed -i "s/USER_ID=\".*\"/USER_ID=\"\"/" "$0" && sed -i "s/API_TOKEN=\".*\"/API_TOKEN=\"\"/" "$0"
}

function getUser() {
    checkIfUserIdIsSet
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/user/$USER_ID" | jq '{display_name: .display_name, external_urls: .external_urls, followers: .followers, country: .country, product: .product, email: .email}'
}

function currentlyPlaying() {
    checkIfUserIdIsSet
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/currently-playing/$USER_ID" | jq '{
        name: .body.item.name,
        artists: [.body.item.artists[].name],
        artist_urls: [.body.item.artists[].external_urls.spotify],
        album: .body.item.album.name,
        duration: .body.item.duration_ms,
        popularity: .body.item.popularity,
        external_urls: .body.item.external_urls.spotify,
        progress: .body.progress_ms,
        progress_bar: (
            "#" * ((.body.progress_ms / .body.item.duration_ms) * 100 | floor)
            + "-" * (100 - ((.body.progress_ms / .body.item.duration_ms) * 100 | floor))
        )
    }'
}

function topTracks() {
  checkIfUserIdIsSet
    amount=${1:-20}
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/top-tracks/$USER_ID?amount=$amount" | jq '.body.items[] | {name: .name, artists: [.artists[].name], artist_urls: [.artists[].external_urls.spotify], album: .album.name, duration: .duration_ms, popularity: .popularity, external_urls: .external_urls}'
}

function topArtists() {
  checkIfUserIdIsSet
    amount=${1:-20}
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/top-artists/$USER_ID?amount=$amount" | jq '.body.items[] | {name: .name, genres: .genres, popularity: .popularity, external_urls: .external_urls}'
}

function recentlyPlayed() {
  checkIfUserIdIsSet
    amount=${1:-20}
    curl -H "x-api-key: $API_TOKEN" "$BASE_URL/last-listened/$USER_ID?amount=$amount" | jq '.body.items[] | {name: .track.name, artists: [.track.artists[].name], album: .track.album.name, duration: .track.duration_ms, played_at: .played_at, external_urls: .track.external_urls}'
}

function createPlaylist() {
  checkIfUserIdIsSet
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
  checkIfUserIdIsSet
    genre=${1:-""}
    recentlyPlayed=${2:-false}
    mostPlayed=${3:-true}
    likedTracks=${4:-true}
    currentlyPlayingSong=${5:-false}

    if [ "$recentlyPlayed" = false ] && [ "$mostPlayed" = false ] && [ "$likedTracks" = false ] && [ "$currentlyPlayingSong" = false ]; then
        echo "Error: You must select at least one option."
        return 1
    fi

    response=$(curl -s -X POST -H "Content-Type: application/json" -H "x-api-key: $API_TOKEN" -d "{\"id\":\"$USER_ID\", \"genre\":\"$genre\", \"recentlyPlayed\":$recentlyPlayed, \"mostPlayed\":$mostPlayed, \"likedTracks\":$likedTracks, \"currentlyPlaying\":$currentlyPlayingSong}" "$BASE_URL/recommendations")
    echo "$response" | jq -r '.tracks.items[] | {name: .track.name, artists: [.track.artists[].name], artist_urls: [.track.artists[].external_urls.spotify], album: .track.album.name, duration: .track.duration_ms, external_urls: .track.external_urls}' | jq -s 'sort_by(.duration) | .[]'
    echo "Playlist URL: $(echo "$response" | jq -r '.external_urls.spotify')"
}


if [ "$1" == "help" ]; then
    help
else
    "$@"
fi