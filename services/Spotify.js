const SpotifyWebApi = require('spotify-web-api-node');
const request = require('request');
const Recommendations = require('./Recommendations.js');
const {MAX} = require('../utils/constants');
const db = require('../db/database.js');

/**
 * Spotify class to handle all Spotify API calls
 */
class Spotify {
    /**
     * Create a Spotify object
     * @constructor
     * @constructs Spotify
     * @returns {Spotify} - The Spotify object
     */
    constructor() {
        this.redirectUri = process.env.SPOTIFY_REDIRECT_URI;
        this.clientId = process.env.SPOTIFY_CLIENT_ID;
        this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

        this.apiCallCount = 0;

        this.spotifyApi = new SpotifyWebApi({
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            redirectUri: this.redirectUri,
        });
        this.recommendations = new Recommendations(this);
    }

    /**
     * Make a Spotify API call and handle token refresh if necessary
     * @param {Function} apiCall - The Spotify API call to make
     * @param {string} id - The user's Discord ID
     * @returns {Promise} - The response from the Spotify API
     * @throws {Error} - Failed to make Spotify API call
     */
    async makeSpotifyApiCall(apiCall, id) {
        const user = await db('users').where('user_id', id).first();
        if (!user) {
            throw new Error('User not found in the database.');
        }
        this.setSpotifyTokens(user.access_token, user.refresh_token);
        this.apiCallCount++;
        console.log('API call count:', this.apiCallCount);
        try {
            return await apiCall();
        } catch (error) {
            console.log('Error:', error);
            const refreshToken = await this.getRefreshToken(id);
            await this.handleTokenRefresh(refreshToken);
            try {
                return await apiCall();
            } catch (error) {
                throw error;
            }
        }
    }

    /**
     * Get the number of Spotify API calls made
     * @returns {number} - The number of Spotify API calls made
     */
    getApiCallCount() {
        return this.apiCallCount;
    }

    /**
     * Get the user's Spotify information
     * @param {string} id - The user's Discord ID
     * @returns {Promise} - The user's Spotify information
     * @throws {Error} - Failed to retrieve Spotify user
     */
    async getUser(id) {
        let user;
        try {
            user = await db('users').where('user_id', id).first();
        } catch (error) {
            throw new Error('Error while fetching user from the database: ' + error.message);
        }

        if (!user) {
            return {error: 'User not found in the database.'};
        }

        this.setSpotifyTokens(user.access_token, user.refresh_token);

        let me;
        try {
            me = await this.spotifyApi.getMe();
        } catch (error) {
            console.log('Error while fetching Spotify user: ' + error.message);
            console.log('Attempting to refresh token and retry...');

            try {
                await this.handleTokenRefresh(user.refresh_token);
            } catch (error) {
                throw new Error('Failed to refresh Spotify token: ' + error.message);
            }

            try {
                me = await this.spotifyApi.getMe();
            } catch (error) {
                throw new Error('Failed to retrieve Spotify user after refreshing token: ' + error.message);
            }
        }

        return me.body;
    }

    /**
     * Get the user's Spotify refresh token
     * @param {string} id - The user's ID
     * @returns {Promise} - The user's Spotify refresh token
     */
    async getRefreshToken(id) {
        const user = await db('users').where('user_id', id).first();
        if (!user) {
            throw new Error('User not found in the database.');
        }
        return user.refresh_token;
    }

    /**
     * Handle token refresh
     * @param {string} refreshToken - The user's Spotify refresh token
     * @returns {Promise} - The refreshed Spotify access token
     * @throws {Error} - Failed to refresh Spotify access token
     */
    async handleTokenRefresh(refreshToken) {
        try {
            const refreshedTokens = await this.refreshAccessToken(refreshToken);
            this.setSpotifyTokens(refreshedTokens.access_token, refreshedTokens.refresh_token);

            await db('users').where('refresh_token', refreshToken).update({
                access_token: refreshedTokens.access_token,
                refresh_token: refreshedTokens.refresh_token,
            });
            return refreshedTokens.access_token;
        } catch (error) {
            throw new Error('Failed to refresh Spotify access token.');
        }
    }

    /**
     * Refresh the user's Spotify access token
     * @param {string} refreshToken - The user's Spotify refresh token
     * @returns {Promise} - The refreshed Spotify access token
     * @throws {Error} - Failed to refresh Spotify access token
     */
    async refreshAccessToken(refreshToken) {
        const authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            headers: {
                Authorization: 'Basic ' + Buffer.from(this.clientId + ':' + this.clientSecret).toString('base64'),
            },
            form: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            },
            json: true,
        };

        return new Promise((resolve, reject) => {
            request.post(authOptions, (error, response, body) => {
                if (!error && response.statusCode === 200) {
                    const {access_token, refresh_token} = body;
                    resolve({
                        access_token: access_token,
                        refresh_token: refresh_token || refreshToken,
                    });
                } else {
                    reject(error);
                }
            });
        });
    }

    /**
     * Set the user's Spotify access and refresh tokens
     * @param {string} accessToken - The user's Spotify access token
     * @param {string} refreshToken - The user's Spotify refresh token
     */
    setSpotifyTokens(accessToken, refreshToken) {
        this.spotifyApi.setAccessToken(accessToken);
        this.spotifyApi.setRefreshToken(refreshToken);
    }

    /**
     * Get the user's currently playing track
     * @param {string} id - The user's ID
     * @returns {Promise} - The user's currently playing track
     * @throws {Error} - Failed to retrieve currently playing track
     */
    async getCurrentlyPlaying(id) {
        try {
            const currentlyPlaying = await this.makeSpotifyApiCall(() => this.spotifyApi.getMyCurrentPlayingTrack(), id);
            return currentlyPlaying.body;
        } catch (error) {
            throw new Error('Failed to retrieve currently playing track.');
        }
    }

    /**
     * Generic method to get tracks
     * @param {string} id - The user's ID
     * @param {Function} spotifyApiMethod - The Spotify API method to call
     * @param {number} [total=25] - The amount of tracks to retrieve. Default is the value of the constant 'max'.
     * @param {boolean} [random=false] - Flag indicating whether to retrieve random tracks. Default is false.
     * @param {string | undefined} genre - The genre to retrieve the tracks for
     * @returns {Promise} - The tracks
     * @throws {Error} - Failed to retrieve tracks
     */
    async getTracks(id, spotifyApiMethod, total = MAX, random = false, genre = undefined) {
        try {
            const offset = random ? Math.floor(Math.random() * total) : 0;
            const tracks = await this.makeSpotifyApiCall(() => spotifyApiMethod({limit: total, offset: offset}), id);

            if (genre) {
                const filteredTracks = await this.filterTracksByGenre(tracks.body.items, genre, id);
                if (filteredTracks.length === 0) {
                    return await this.getTracks(id, spotifyApiMethod, total, true, genre);
                }
                return {items: filteredTracks};
            }
            return tracks.body;
        } catch (error) {
            throw new Error('Failed to retrieve tracks.');
        }
    }

    /**
     * Get the user's top artists
     * @param {string} id - The user's ID
     * @param {number} [amount=25] - The amount of top artists to retrieve. Default is the value of the constant 'max'.
     * @returns {Promise} - The user's top artists
     * @throws {Error} - Failed to retrieve top artists
     */
    async getTopArtists(id, amount = MAX) {
        try {
            const topArtists = await this.makeSpotifyApiCall(() => this.spotifyApi.getMyTopArtists({limit: amount}), id);
            return topArtists.body;
        } catch (error) {
            throw new Error('Failed to retrieve top artists.');
        }
    }

    /**
     * Get the user's top tracks
     * @param {string} id - The user's ID
     * @param {number} month - The month to create the playlist for
     * @param {number} year - The year to create the playlist for
     * @param {string | undefined} playlistName - The name of the playlist to create
     * @param {string | undefined} genre - The genre to create the playlist for
     * @returns {Promise} - The created playlist
     * @throws {Error} - Failed to create playlist
     */
    async createPlaylist(id, month, year, playlistName = undefined, genre = undefined) {
        if (!playlistName) {
            const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', {month: 'short'});
            playlistName = `Liked Tracks from ${monthName} ${year}.`;
        }
        try {
            const songsFromMonth = await this.findLikedFromMonth(id, month, year, genre);
            const playlistDescription = `This playlist is generated with your liked songs from ${month}/${year}.`;
            if (songsFromMonth.length === 0) {
                return
            }
            const playlist = await this.makeSpotifyApiCall(() =>
                this.spotifyApi.createPlaylist(playlistName, {
                    description: playlistDescription,
                    public: false,
                    collaborative: false,
                }), id
            );
            const songUris = songsFromMonth.map((song) => song.track.uri);
            return await this.addTracksToPlaylistAndRetrieve(songUris, playlist, id);
        } catch (error) {
            throw new Error('Failed to create playlist: ' + error.message);
        }
    }

    async addTracksToPlaylistAndRetrieve(songUris, playlist, id) {
        for (let i = 0; i < songUris.length; i += MAX) {
            const uris = songUris.slice(i, i + MAX);
            await this.makeSpotifyApiCall(() => this.spotifyApi.addTracksToPlaylist(playlist.body.id, uris), id);
        }
        const playlistWithTracks = await this.makeSpotifyApiCall(() => this.spotifyApi.getPlaylist(playlist.body.id), id);
        return playlistWithTracks.body;
    }

    /**
     * Find liked songs from a specific month
     * @param {string} id - The user's ID
     * @param {number} month - The month to create the playlist for
     * @param {number} year - The year to create the playlist for
     * @param {string} genre - The genre to create the playlist for
     * @returns {Promise} - The liked songs from the specified month
     * @throws {Error} - Failed to retrieve liked songs
     */
    async findLikedFromMonth(id, month, year, genre = undefined) {
        let likedTracks = [];
        let offset = 0;
        let limit = MAX;
        let total = 1;
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        while (likedTracks.length < total) {
            const response = await this.makeSpotifyApiCall(() =>
                this.spotifyApi.getMySavedTracks({limit: limit, offset: offset}), id);
            const songs = response.body.items;
            total = response.body.total;
            offset += limit;

            const addedAt = new Date(songs[0].added_at);
            if (addedAt < startDate || (addedAt > endDate && likedTracks.length > 0)) {
                break;
            }

            if (genre) {
                const artistIds = songs.map(song => song.track.artists[0].id);
                const artists = await this.makeSpotifyApiCall(() => this.spotifyApi.getArtists(artistIds), id);
                const artistGenres = artists.body.artists.reduce((acc, artist) => {
                    acc[artist.id] = artist.genres;
                    return acc;
                }, {});

                for (let song of songs) {
                    const addedAt = new Date(song.added_at);
                    if (addedAt >= startDate && addedAt <= endDate) {
                        if (artistGenres[song.track.artists[0].id].includes(genre)) {
                            likedTracks.push(song);
                        }
                    }
                }
            } else {
                likedTracks = likedTracks.concat(
                    songs.filter((song) => {
                        const addedAt = new Date(song.added_at);
                        return addedAt >= startDate && addedAt <= endDate;
                    })
                );
            }
        }
        return likedTracks;
    }

    /**
     * Get the user's top tracks
     * @param {Array<string>} tracksIds - The IDs of the tracks to get audio features for
     * @param {string} id - The user's ID
     * @returns {Promise} - The audio features for the specified tracks
     */
    async getAudioFeatures(tracksIds, id) {
        const limit = 100;
        let offset = 0;
        const total = tracksIds.length;
        let audioFeatures = [];

        while (audioFeatures.length < total) {
            const response = await this.makeSpotifyApiCall(() =>
                this.spotifyApi.getAudioFeaturesForTracks(tracksIds.slice(offset, offset + limit)), id);
            audioFeatures = audioFeatures.concat(response.body.audio_features);
            offset += limit;
        }

        return audioFeatures;
    }

    /**
     * Get the audio features for a playlist
     * @param {string} playlistId - The ID of the playlist
     * @param {string} id - The user's ID
     * @returns {Promise} - The audio features for the specified playlist
     */
    async getAudioFeaturesFromPlaylist(playlistId, id) {
        const playlistTracks = await this.getTracksFromPlaylist(id, playlistId);
        const songIds = playlistTracks.body.items.map((song) => song.track.id);
        return await this.getAudioFeatures(songIds, id);
    }

    /**
     * Get the songs from a playlist
     * @param {string} id - The user's ID
     * @param {string} playlistId - The ID of the playlist
     * @returns {Promise} - The songs from the specified playlist
     */
    async getTracksFromPlaylist(id, playlistId) {
        return await this.makeSpotifyApiCall(() => this.spotifyApi.getPlaylistTracks(playlistId), id);
    }

    /**
     * Fetches songs based on the condition.
     * @param {string} id - The user's ID.
     * @param {string} condition - The condition to fetch songs based on.
     * @param {number} max - The maximum amount of songs to fetch.
     * @param {boolean} random - Whether to fetch random songs.
     * @param {string} genre - The genre to filter the songs by.
     * @returns {Promise} - The fetched songs.
     */
    async fetchTracks(id, condition, max = MAX, random, genre = undefined) {
        switch (condition) {
            case 'currentlyPlaying':
                const currentlyPlaying = await this.getCurrentlyPlaying(id);
                return [currentlyPlaying.item.id];
            case 'mostPlayed':
                const mostPlayedTracks = await this.getTracks(id, this.spotifyApi.getMyTopTracks.bind(this.spotifyApi));
                return mostPlayedTracks.items.map((song) => song.id);
            case 'likedTracks':
                const likedTracks = await this.getTracks(id, this.spotifyApi.getMySavedTracks.bind(this.spotifyApi));
                return likedTracks.items.map((song) => song.track.id);
            case 'recentlyPlayed':
                const recentlyPlayedTracks = await this.getTracks(id, this.spotifyApi.getMyRecentlyPlayedTracks.bind(this.spotifyApi));
                return recentlyPlayedTracks.items.map((song) => song.track.id);
            default:
                return [];
        }
    }

    /**
     * Filter liked songs by genre and create a playlist
     * @param {string} id - The user's ID
     * @param {string} genre - The genre to filter the liked songs by
     * @param {number} [amount=25] - The amount of liked songs to retrieve. Default is the value of the constant 'max'.
     * @returns {Promise} - The created playlist
     */
    async createFilteredPlaylist(id, genre, amount = MAX) {
        let likedTracks = [];
        let offset = 0;
        let limit = MAX;
        let total = 1;

        while (likedTracks.length < total) {
            let response;
            try {
                response = await this.makeSpotifyApiCall(() =>
                    this.spotifyApi.getMySavedTracks({limit: limit, offset: offset}), id);
            } catch (error) {
                console.error('Failed to get saved tracks:', error);
                return;
            }
            const songs = response.body.items;
            total = response.body.total;
            offset += limit;

            likedTracks = likedTracks.concat(songs);
        }
        let filteredTracks = await this.filterTracksByGenre(likedTracks, genre, id);

        let playlist;
        try {
            playlist = await this.makeSpotifyApiCall(() =>
                this.spotifyApi.createPlaylist('Liked Tracks - ' + genre, {
                    description: `This playlist is generated with your liked songs from the genre ${genre}.`,
                    public: false,
                    collaborative: false,
                }), id
            );
        } catch (error) {
            console.error('Failed to create playlist:', error);
            return;
        }
        if (!playlist || !playlist.body) {
            console.error('Playlist is undefined or does not have a body property');
            return;
        }

        const chunkSize = 100;
        for (let i = 0; i < filteredTracks.length; i += chunkSize) {
            const chunk = filteredTracks.slice(i, i + chunkSize);
            const songUris = chunk.map(song => song.track.uri);
            try {
                await this.makeSpotifyApiCall(() => this.spotifyApi.addTracksToPlaylist(playlist.body.id, songUris), id);
            } catch (error) {
                console.error('Failed to add tracks to playlist:', error);
                return;
            }
        }

        // Retrieve and return the created playlist
        let playlistWithTracks;
        try {
            playlistWithTracks = await this.makeSpotifyApiCall(() => this.spotifyApi.getPlaylist(playlist.body.id), id);
        } catch (error) {
            console.error('Failed to get playlist:', error);
            return;
        }
        return playlistWithTracks.body;
    }

    /**
     * Get the user's last liked tracks
     * @param {string} id - The user's ID
     * @param {number} amount - The amount of tracks to retrieve
     * @param {number} offset - The offset to start from
     * @returns {Promise} - The user's last liked tracks
     */
    async getPlaylists(id, amount = MAX, offset = 0) {
        const user = await this.getUser(id);
        const playlists = await this.makeSpotifyApiCall(() => this.spotifyApi.getUserPlaylists(user.id, {limit: amount, offset: offset}), id);
        return playlists.body;
    }

    /**
     * Filter liked songs by genre
     * @param {Array} songs
     * @param {string} genre
     * @param {string} id
     * @returns {Promise<Array>} - The filtered songs
     */
    async filterTracksByGenre(songs, genre, id) {
        const artistIds = songs.map(song => song.track.artists[0].id);
        const chunkSize = 50; // Maximum number of artist IDs per request
        const filteredTracks = [];

        // Batch artist IDs and make API calls in chunks
        for (let i = 0; i < artistIds.length; i += chunkSize) {
            const chunk = artistIds.slice(i, i + chunkSize);
            const artists = await this.makeSpotifyApiCall(() => this.spotifyApi.getArtists(chunk), id);

            // Filter songs based on genre
            songs.forEach(song => {
                const artist = artists.body.artists.find(artist => artist.id === song.track.artists[0].id);
                if (artist && artist.genres.includes(genre)) {
                    filteredTracks.push(song);
                }
            });
        }
        return [...new Set(filteredTracks)];
    }

    /**
     * @param {string} id - The user's ID
     * @param {string} access_token - The user's Spotify access token
     * @param {string} refresh_token - The user's Spotify refresh token
     * @param {number} expires_in - The time in seconds until the access token expires
     * @param {string} api_token - The user's API token
     * @returns {Promise<void>}
     */
    async insertUserIntoDatabase(id, access_token, refresh_token, expires_in, api_token) {
        await db('users').insert({
            user_id: id,
            access_token: access_token,
            refresh_token: refresh_token,
            expires_in: expires_in,
            api_token: api_token,
        }).catch((err) => {
            console.log("Error inserting user into database: ", err);
            return err;
        });
    }

    /**
     * @param {string} id - The user's ID
     * @returns {Promise<void>}
     */
    async deleteUser(id) {
        await db('users').where('user_id', id).del().catch((err) => {
            console.log("Error deleting user from database: ", err);
            return err;
        });
    }

    /**
     * @param {string} code - The authorization code
     * @param {string} id - The user's ID
     * @returns {Promise<void>}
     */
    async authorizationCodeGrant(code, id) {
        return new Promise((resolve, reject) => {
            this.spotifyApi.authorizationCodeGrant(code)
                .then(
                    async (data) => {
                        const {access_token, refresh_token, expires_in} = data.body;
                        const api_token = require('crypto').createHash('sha256').update(id + access_token).digest('hex');
                        await this.insertUserIntoDatabase(id, access_token, refresh_token, expires_in, api_token);
                        resolve(api_token);
                    },
                    (err) => {
                        console.log('Something went wrong!', err);
                        reject(err);
                    }
                );
        });
    }
}

module.exports = Spotify;
