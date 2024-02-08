const express = require('express');
const Spotify = require('./Spotify.js');
const app = express();
app.use(express.json());

//use dotenv
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.API_KEY;

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

function authenticateApiKey(req, res, next) {
    if (process.env.DEV_MODE === 'true') {
        console.log(req.originalUrl);
        next();
        return;
    }
    const apiKey = req.headers['x-api-key'];

    if (apiKey === API_KEY) {
        next();
    } else {
        res.status(403).json({ error: 'Unauthorized' });
    }
}

app.get('/authorize/:userId', authenticateApiKey, catchErrors(async (req, res) => {
    const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=user-read-email%20user-read-private%20user-library-read%20user-top-read%20user-read-recently-played%20user-read-currently-playing%20user-follow-read%20playlist-read-private%20playlist-modify-public%20playlist-modify-private%20playlist-read-collaborative%20user-library-modify&state=${req.params.userId}`;
    res.send(url);
}));

app.get('/callback', catchErrors(async (req, res) => {
    const code = req.query.code; // Extract the authorization code from the request parameters
    try {
        const data = await spotify.authorizationCodeGrant(code, req.query.state.replace('%', ''));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}));

app.post('/delete-user', authenticateApiKey, catchErrors(async (req, res) => {
    const user = await spotify.deleteUser(req.body.id);
    res.json(user);
}));

app.get('/user/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const user = await spotify.getUser(req.params.id);
    res.json(user);
}));

app.get('/currently-playing/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const currentlyPlaying = await spotify.getCurrentlyPlaying(req.params.id);
    res.json(currentlyPlaying);
}));

app.get('/top-tracks/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const topTracks = await spotify.getTopTracks(req.params.id);
    res.json(topTracks);

}));

app.get('/top-artists/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const topArtists = await spotify.getTopArtists(req.params.id);
    res.json(topArtists);
}));

app.get('/recently-played/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const recentlyPlayed = await spotify.getLastListenedTracks(req.params.id);
    res.json(recentlyPlayed);
}));

app.post('/create-playlist', authenticateApiKey, catchErrors(async (req, res) => {
    const { id, month, year, playlistName } = req.body;
    const playlist = await spotify.createPlaylist(id, month, year, playlistName);
    res.json(playlist);
}));


app.post('/recommendations', authenticateApiKey, catchErrors(async (req, res) => {
    const { id, genre, recentlyPlayed, mostPlayed, likedSongs } = req.body;
    const playlist = await spotify.createRecommendationPlaylist(id, genre, recentlyPlayed, mostPlayed, likedSongs);
    res.json(playlist);
}));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server is running on port ${port}`));