const express = require('express');
const router = express.Router();
const Spotify = require('../services/Spotify.js');
const authenticateApiKey = require('../middlewares/authenticateApiKey');
const catchErrors = require('../middlewares/catchErrors');

const spotify = new Spotify();

router.get("/", (req, res) => {
    res.status(200).json({message: "Vibify API is running"});
});

router.get('/authorize/:userId', catchErrors(async (req, res) => {
    const url = `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${process.env.SPOTIFY_REDIRECT_URI}&scope=user-read-email%20user-read-private%20user-library-read%20user-top-read%20user-read-recently-played%20user-read-currently-playing%20user-follow-read%20playlist-read-private%20playlist-modify-public%20playlist-modify-private%20playlist-read-collaborative%20user-library-modify&state=${req.params.userId}`;
    res.send(url);
}));

router.get('/callback', catchErrors(async (req, res) => {
    const code = req.query.code;
    try {
        const api_token = await spotify.authorizationCodeGrant(code, req.query.state.replace('%', ''));
        res.json({api_token});
    } catch (err) {
        res.status(500).json({error: err.message});
    }
}));

router.get('/delete-user/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const user = await spotify.deleteUser(req.params.id);
    res.json(user);
}));

router.get('/user/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const user = await spotify.getUser(req.params.id);
    res.send(user);
}));


function createRoute(path, spotifyMethod) {
    router.get(path, authenticateApiKey, catchErrors(async (req, res) => {
        const result = await spotify.getTracks(req.params.id, spotifyMethod.bind(spotify.spotifyApi), req.query.amount);
        res.json(result);
    }));
}

createRoute('/top-tracks/:id', spotify.spotifyApi.getMyTopTracks);
createRoute('/last-listened/:id', spotify.spotifyApi.getMyRecentlyPlayedTracks);
createRoute('/last-liked/:id', spotify.spotifyApi.getMySavedTracks);
createRoute('/currently-playing/:id', spotify.spotifyApi.getMyCurrentPlayingTrack);
createRoute('/top-artists/:id', spotify.spotifyApi.getMyTopArtists);

router.get('/audio-features/:playlist/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const audioFeatures = await spotify.getAudioFeaturesFromPlaylist(req.params.playlist, req.params.id);
    res.json(audioFeatures);
}));

router.get('/playlists/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const playlists = await spotify.getPlaylists(req.params.id, req.query.amount, req.query.offset);
    res.json(playlists);
}));

router.post('/recommendations', authenticateApiKey, catchErrors(async (req, res) => {
    const {
        id,
        genre,
        recentlyPlayed,
        mostPlayed,
        likedTracks,
        currentlyPlaying,
        useAudioFeatures,
        useTrackSeeds,
        targetValues,
        amount
    } = req.body;
    const playlist = await spotify.recommendations.createRecommendationPlaylist(
        id, {
        genre: genre,
        recentlyPlayed: recentlyPlayed,
        mostPlayed: mostPlayed,
        likedTracks: likedTracks,
        currentlyPlaying: currentlyPlaying,
        useAudioFeatures: useAudioFeatures,
        useTrackSeeds: useTrackSeeds,
        targetValues: targetValues
    }, amount);
    res.json(playlist);
}));

router.post('/create-playlist', authenticateApiKey, catchErrors(async (req, res) => {
    const {id, month, year, playlistName, genre} = req.body;
    const playlist = await spotify.createPlaylist(id, month, year, playlistName, genre);
    res.json(playlist);
}));

router.post('/filter-liked-tracks', authenticateApiKey, catchErrors(async (req, res) => {
    const {id, genre} = req.body;
    const filteredTracks = await spotify.createFilteredPlaylist(id, genre);
    res.json(filteredTracks);
}));

module.exports = router;