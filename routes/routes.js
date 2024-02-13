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
    res.json(user);
}));

router.get('/currently-playing/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const currentlyPlaying = await spotify.getCurrentlyPlaying(req.params.id);
    res.json(currentlyPlaying);
}));

router.get('/top-tracks/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const topTracks = await spotify.getTopTracks(req.params.id, req.query.amount);
    res.json(topTracks);
}));

router.get('/top-artists/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const topArtists = await spotify.getTopArtists(req.params.id, req.query.amount);
    res.json(topArtists);
}));

router.get('/recently-played/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const recentlyPlayed = await spotify.getLastListenedTracks(req.params.id, req.query.amount);
    res.json(recentlyPlayed);
}));

router.get('/last-listened/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const lastListened = await spotify.getLastListenedTracks(req.params.id, req.query.amount);
    res.json(lastListened);
}));

router.get('/audio-features/:playlist/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const audioFeatures = await spotify.getAudioFeaturesFromPlaylist(req.params.playlist, req.params.id);
    res.json(audioFeatures);
}));

router.post('/create-playlist', authenticateApiKey, catchErrors(async (req, res) => {
    const {id, month, year, playlistName} = req.body;
    const playlist = await spotify.createPlaylist(id, month, year, playlistName);
    res.json(playlist);
}));

router.post('/recommendations', authenticateApiKey, catchErrors(async (req, res) => {
    const {id, genre, recentlyPlayed, mostPlayed, likedSongs, currentlyPlaying, useAudioFeatures, targetValues} = req.body;
    const playlist = await spotify.createRecommendationPlaylist(id, genre, recentlyPlayed, mostPlayed, likedSongs, currentlyPlaying, useAudioFeatures, targetValues);
    res.json(playlist);
}));

module.exports = router;