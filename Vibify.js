const express = require('express');
const Spotify = require('./Spotify.js');
const app = express();
app.use(express.json());

//use dotenv
const dotenv = require('dotenv');
dotenv.config();

const knex = require('knex')({
    client: 'mysql',
    connection: {
        host: '127.0.0.1',
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: 'vibify'
    },
});

const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

// Initialize Spotify class
const spotify = new Spotify(redirectUri, clientId, clientSecret);


function catchErrors(fn) {
    return function (req, res, next) {
        return fn(req, res, next).catch((err) => {
            console.error(err); // Log the error
            next(err);
        });
    }
}

async function authenticateApiKey(req, res, next) {
    if (process.env.DEV_MODE === 'true') {
        console.log(req.originalUrl);
        next();
        return;
    }
    const apiKey = req.headers['x-api-key'];
    const application_id = req.headers['x-application-id'];
    if (application_id) {
        if (application_id === process.env.APPLICATION_ID) {
            console.log('Application ID is correct');
            next();
        } else {
            res.status(403).json({error: 'Unauthorized'});
        }
        return;
    }

    const userId = req.params.id || req.body.id;
    const user = await knex('users').where('user_id', userId).first();
    if (user.api_token === apiKey) {
        next();
    } else {
        res.status(403).json({error: 'Unauthorized'});
    }
}

app.get("/" , (req, res) => {
    res.status(200).send("Vibify API is running");
});

app.get('/authorize/:userId', catchErrors(async (req, res) => {
    const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=user-read-email%20user-read-private%20user-library-read%20user-top-read%20user-read-recently-played%20user-read-currently-playing%20user-follow-read%20playlist-read-private%20playlist-modify-public%20playlist-modify-private%20playlist-read-collaborative%20user-library-modify&state=${req.params.userId}`;
    res.send(url);
}));

app.get('/callback', catchErrors(async (req, res) => {
    const code = req.query.code; // Extract the authorization code from the request parameters
    try {
        const api_token = await spotify.authorizationCodeGrant(code, req.query.state.replace('%', ''));
        res.json({api_token});
    } catch (err) {
        res.status(500).json({error: err.message});
    }
}));

app.get('/delete-user/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const user = await spotify.deleteUser(req.params.id);
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
    const topTracks = await spotify.getTopTracks(req.params.id, req.query.amount);
    res.json(topTracks);

}));

app.get('/top-artists/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const topArtists = await spotify.getTopArtists(req.params.id, req.query.amount);
    res.json(topArtists);
}));

app.get('/recently-played/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const recentlyPlayed = await spotify.getLastListenedTracks(req.params.id, req.query.amount);
    res.json(recentlyPlayed);
}));

app.get('/last-listened/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const lastListened = await spotify.getLastListenedTracks(req.params.id, req.query.amount);
    res.json(lastListened);
}));

app.get('/audio-features/:playlist/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const audioFeatures = await spotify.getAudioFeaturesFromPlaylist(req.params.playlist, req.params.id);
    res.json(audioFeatures);
}));

app.post('/create-playlist', authenticateApiKey, catchErrors(async (req, res) => {
    const {id, month, year, playlistName} = req.body;
    const playlist = await spotify.createPlaylist(id, month, year, playlistName);
    res.json(playlist);
}));


app.post('/recommendations', authenticateApiKey, catchErrors(async (req, res) => {
    const {id, genre, recentlyPlayed, mostPlayed, likedSongs} = req.body;
    const playlist = await spotify.createRecommendationPlaylist(id, genre, recentlyPlayed, mostPlayed, likedSongs);
    res.json(playlist);
}));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server is running on port ${port}`));