const express = require('express');
const Spotify = require('./Spotify.js');
const app = express();
app.use(express.json());

//use dotenv
const dotenv = require('dotenv');
dotenv.config();

// Spotify API credentials
const secureToken = process.env.SPOTIFY_SECURE_TOKEN;
const apiUrl = process.env.SPOTIFY_API_URL;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

// Initialize Spotify class
const spotify = new Spotify(secureToken, apiUrl, redirectUri, clientId, clientSecret);


function catchErrors(fn) {
    return function(req, res, next) {
        return fn(req, res, next).catch((err) => {
            console.error(err); // Log the error
            next(err);
        });
    }
}

app.get('/spotify/user/:id', catchErrors(async (req, res) => {
    const user = await spotify.getUser(req.params.id);
    res.json(user);
}));

app.get('/spotify/currently-playing/:id', catchErrors(async (req, res) => {
    const currentlyPlaying = await spotify.getCurrentlyPlaying(req.params.id);
    res.json(currentlyPlaying);
}));

app.get('/spotify/top-tracks/:id', catchErrors(async (req, res) => {
    const topTracks = await spotify.getTopTracks(req.params.id);
    res.json(topTracks);

}));

app.get('/spotify/top-artists/:id', catchErrors(async (req, res) => {
    const topArtists = await spotify.getTopArtists(req.params.id);
    res.json(topArtists);
}));

app.get('/spotify/recently-played/:id', catchErrors(async (req, res) => {
    const recentlyPlayed = await spotify.getLastListenedTracks(req.params.id);
    res.json(recentlyPlayed);
}));

app.post('/spotify/create-playlist', catchErrors(async (req, res) => {
    const { id, month, year, playlistName } = req.body;
    const playlist = await spotify.createPlaylist(id, month, year, playlistName);
    res.json(playlist);
}));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server is running on port ${port}`));