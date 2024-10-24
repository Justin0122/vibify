import express from 'express';
import Spotify from '../services/Spotify.js';
import authenticateApiKey from '../middlewares/authenticateApiKey.js';
import catchErrors from '../middlewares/catchErrors.js';
import cache from '../middlewares/redisCache.js';

const router = express.Router();
const spotify = new Spotify();

router.get("/", (req, res) => {
    res.status(200).json({message: "Vibify API is running"});
});

router.get('/authorize/:userId', catchErrors(async (req, res) => {
    const url = `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${process.env.SPOTIFY_REDIRECT_URI}&scope=user-read-email%20user-read-private%20user-library-read%20user-top-read%20user-read-recently-played%20user-read-currently-playing%20user-follow-read%20playlist-read-private%20playlist-modify-public%20playlist-modify-private%20playlist-read-collaborative%20user-library-modify&state=${req.params.userId}`;
    res.redirect(url)
}));

router.get('/callback', catchErrors(async (req, res) => {
    const code = req.query.code;
    try {
        const {api_token, userId} = await spotify.authorizationCodeGrant(code, req.query.state.replace('%', ''));
        res.redirect(`${process.env.REDIRECT_URI}/dashboard?userId=${userId}&api_token=${api_token}`);
    } catch (err) {
        res.status(500).json({error: err.message});
    }
}));

router.get('/delete-user/:id', authenticateApiKey, catchErrors(async (req, res) => {
    const user = await spotify.deleteUser(req.params.id);
    res.json(user);
}));

router.get('/user/:id', authenticateApiKey, cache, catchErrors(async (req, res) => {
    try {
        const user = await spotify.getUser(req.params.id);
        res.send(user);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
}));


function createRoute(path, spotifyMethod) {
    router.get(path, authenticateApiKey, cache, catchErrors(async (req, res) => {
        const options = req.query;
        options.limit = options.limit || 50;
        options.offset = options.offset || 0;
        options.time_range = options.time_range || 'medium_term';
        try {
            let result = await spotifyMethod.bind(spotify.spotifyApi)(options);
            if (result.error) return res.status(404).json({error: result.error});
            res.json(result);
        } catch (error) {
            const user = await spotify.getUser(req.params.id);
            if (!user) return res.status(500).json({error: error.message});
            const refreshToken = await spotify.getRefreshToken(req.params.id);
            await spotify.handleTokenRefresh(refreshToken);
            const result = await spotifyMethod.bind(spotify.spotifyApi)(options);
            if (result.error) return res.status(404).json({error: result.error});
            res.json(result);
        }
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
    const {id, amount} = req.body;
    const options = {...req.body};
    delete options.id;
    delete options.amount;
    const playlist = await spotify.recommendations.createRecommendationPlaylist(id, options, amount);
    res.json(playlist);
}));

router.post('/create-playlist', authenticateApiKey, catchErrors(async (req, res) => {
    const {id, month, year, playlistName, genre} = req.body;
    const playlist = await spotify.createPlaylist(id, month, year, playlistName, genre);
    res.json(playlist);
}));

router.post('/filter-liked-tracks', authenticateApiKey, catchErrors(async (req, res) => {
    const {id, filter, playlistName} = req.body;
    try {
        const playlist = await spotify.createFilteredPlaylist(id, filter, playlistName);
        res.json(playlist);
        await spotify.addTracksToPlaylistInBackground(id, playlist.id, filter);
    } catch (error) {
        res.status(500).json({error: 'Failed to initiate playlist creation'});
    }
}));

export default router;
