const SpotifyWebApi = require('spotify-web-api-node');
const request = require('request');
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

const max = 25;

/**
 * Spotify class to handle all Spotify API calls
 * @class
 * @classdesc Class to handle all Spotify API calls
 */
class Spotify {
    /**
     * Create a Spotify object
     * @param {string} redirectUri - The redirect URI for the Spotify API
     * @param {string} clientId - The client ID for the Spotify API
     * @param {string} clientSecret - The client secret for the Spotify API
     */
    constructor(redirectUri, clientId, clientSecret) {
        this.redirectUri = redirectUri;
        this.clientId = clientId;
        this.clientSecret = clientSecret;

        this.apiCallCount = 0;

        this.spotifyApi = new SpotifyWebApi({
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            redirectUri: this.redirectUri,
        });
    }

    /**
     * Make a Spotify API call and handle token refresh if necessary
     * @param {Function} apiCall - The Spotify API call to make
     * @param {string} id - The user's Discord ID
     * @returns {Promise} - The response from the Spotify API
     * @throws {Error} - Failed to make Spotify API call
     */
    async makeSpotifyApiCall(apiCall, id) {
        const user = await knex('users').where('user_id', id).first();
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
        try {
            const user = await knex('users').where('user_id', id).first();
            if (!user) {
                throw new Error('User not found in the database.');
            }

            this.setSpotifyTokens(user.access_token, user.refresh_token);

            try {
                const me = await this.spotifyApi.getMe();
                return me.body;
            } catch (error) {
                try {
                    await this.handleTokenRefresh(user.refresh_token);
                } catch (error) {
                    return;
                }
                try {
                    const refreshedMe = await this.spotifyApi.getMe();
                    return refreshedMe.body;
                } catch (error) {
                    throw new Error('Failed to retrieve Spotify user after refreshing token: ' + error.message);
                }
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get the user's Spotify refresh token
     * @param {string} id - The user's ID
     * @returns {Promise} - The user's Spotify refresh token
     */
    async getRefreshToken(id) {
        try {
            const user = await knex('users').where('user_id', id).first();
            if (!user) {
                throw new Error('User not found in the database.');
            }
            return user.refresh_token;
        } catch (error) {
            throw error;
        }
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

            await knex('users').where('refresh_token', refreshToken).update({
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
     * Get the user's top tracks
     * @param {string} id - The user's ID
     * @param {number} [total=25] - The amount of top tracks to retrieve. Default is the value of the constant 'max'.
     * @param {boolean} [random=false] - Flag indicating whether to retrieve random tracks. Default is false.
     * @returns {Promise} - The user's top tracks
     * @throws {Error} - Failed to retrieve top tracks
     */
    async getTopTracks(id, total = max, random = false) {
        try {
            const offset = random ? Math.floor(Math.random() * total) : 0;
            const likedSongs = await this.makeSpotifyApiCall(() => this.spotifyApi.getMyTopTracks({
                limit: total,
                offset: offset
            }), id);

            return likedSongs.body;
        } catch (error) {
            throw new Error('Failed to retrieve top tracks.');
        }
    }

    /**
     * Get the user's last listened tracks
     * @param {string} id - The user's ID
     * @param {number} [amount=25] - The amount of last listened tracks to retrieve. Default is the value of the constant 'max'.
     * @param {boolean} [random=false] - Flag indicating whether to retrieve random tracks. Default is false.
     * @returns {Promise} - The user's last listened tracks
     * @throws {Error} - Failed to retrieve last listened tracks
     */
    async getLastListenedTracks(id, amount = max, random = false) {
        try {
            const offset = random ? Math.floor(Math.random() * amount) : 0;
            const lastListened = await this.makeSpotifyApiCall(() => this.spotifyApi.getMyRecentlyPlayedTracks({
                limit: amount,
                offset: offset
            }), id);
            return lastListened.body;
        } catch (error) {
            throw new Error('Failed to retrieve last listened tracks.');
        }
    }

    /**
     * Get the user's top artists
     * @param {string} id - The user's ID
     * @param {number} [amount=25] - The amount of top artists to retrieve. Default is the value of the constant 'max'.
     * @returns {Promise} - The user's top artists
     * @throws {Error} - Failed to retrieve top artists
     */
    async getTopArtists(id, amount = max) {
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
     * @returns {Promise} - The created playlist
     * @throws {Error} - Failed to create playlist
     */
    async createPlaylist(id, month, year, playlistName) {
        if (!playlistName) {
            const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', {month: 'short'});
            playlistName = `Liked Songs from ${monthName} ${year}.`;
        }
        try {
            const songsFromMonth = await this.findLikedFromMonth(id, month, year);
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
        for (let i = 0; i < songUris.length; i += max) {
            const uris = songUris.slice(i, i + max);
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
     * @returns {Promise} - The liked songs from the specified month
     * @throws {Error} - Failed to retrieve liked songs
     */
    async findLikedFromMonth(id, month, year,) {
        let likedSongs = [];
        let offset = 0;
        let limit = max;
        let total = 1;
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        while (likedSongs.length < total) {
            const response = await this.makeSpotifyApiCall(() =>
                this.spotifyApi.getMySavedTracks({limit: limit, offset: offset}), id);
            const songs = response.body.items;
            total = response.body.total;
            offset += limit;

            const addedAt = new Date(songs[0].added_at);
            if (addedAt < startDate || (addedAt > endDate && likedSongs.length > 0)) {
                break;
            }

            likedSongs = likedSongs.concat(
                songs.filter((song) => {
                    const addedAt = new Date(song.added_at);
                    return addedAt >= startDate && addedAt <= endDate;
                })
            );
        }
        return likedSongs;
    }

    /**
     * Get the user's top tracks
     * @param {string} id - The user's ID
     * @param {number} [total=25] - The amount of top tracks to retrieve. Default is the value of the constant 'max'.
     * @param {boolean} [random=false] - Flag indicating whether to retrieve random tracks. Default is false.
     * @returns {Promise} - The user's top tracks
     * @throws {Error} - Failed to retrieve top tracks
     */
    async getLikedSongs(id, total = max, random = false) {
        try {
            const offset = random ? Math.floor(Math.random() * total) : 0;
            const likedSongs = await this.makeSpotifyApiCall(() => this.spotifyApi.getMySavedTracks({
                limit: total,
                offset: offset
            }), id);

            return likedSongs.body;
        } catch (error) {
            throw new Error('Failed to retrieve liked songs.');
        }
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
        console.log('Getting audio features from playlist...');
        const playlistSongs = await this.getSongsFromPlaylist(id, playlistId);
        const songIds = playlistSongs.body.items.map((song) => song.track.id);
        return await this.getAudioFeatures(songIds, id);
    }

    /**
     * Get the songs from a playlist
     * @param {string} id - The user's ID
     * @param {string} playlistId - The ID of the playlist
     * @returns {Promise} - The songs from the specified playlist
     */
    async getSongsFromPlaylist(id, playlistId) {
        return await this.makeSpotifyApiCall(() => this.spotifyApi.getPlaylistTracks(playlistId), id);
    }

    /**
     * Creates a recommendation playlist.
     * @param {string} id - The user's ID.
     * @param {Array<string>|string} genre - The genre(s).
     * @param {boolean} [mostPlayed=true] - Flag indicating whether to include most played songs. Default is true.
     * @param {boolean} [likedSongs=true] - Flag indicating whether to include liked songs. Default is true.
     * @param {boolean} [recentlyPlayed=false] - Flag indicating whether to include recently played songs. Default is false.
     * @param {boolean} [currentlyPlayingSong=false] - Flag indicating whether to include currently playing song. Default is false.
     * @returns {Promise} - The created recommendation playlist.
     */
    async createRecommendationPlaylist(id, genre, mostPlayed = true, likedSongs = true, recentlyPlayed = false, currentlyPlayingSong = false) {
        const options = [mostPlayed, likedSongs, recentlyPlayed, currentlyPlayingSong];

        if (!options.includes(true)) {
            throw new Error('You must select at least one option.');
        }
        const songIds = [];
        let currentlyPlayingId = '';

        if (options.includes(true)) {
            if (currentlyPlayingSong) {
                const currentlyPlaying = await this.getCurrentlyPlaying(id);
                songIds.push(currentlyPlaying.item.id);
                currentlyPlayingId = currentlyPlaying.item.id;
            }
            if (mostPlayed) {
                const mostPlayedSongs = await this.getTopTracks(id, max, true);
                songIds.push(...mostPlayedSongs.items.map((song) => song.id));
            }
            if (likedSongs) {
                const likedSongs = await this.getLikedSongs(id, max, true);
                songIds.push(...likedSongs.items.map((song) => song.track.id));
            }
            if (recentlyPlayed || currentlyPlayingSong) {
                const recentlyPlayedSongs = await this.getLastListenedTracks(id, max, true);
                songIds.push(...recentlyPlayedSongs.items.map((song) => song.track.id));
            }

            if (songIds.length === 0 && !currentlyPlayingId) {
                throw new Error('No songs found.');
            }
        }

        const audioFeatures = await this.getAudioFeatures(songIds, id);
        let lowestDanceability = Math.min(...audioFeatures.map((track) => track.danceability));
        let highestDanceability = Math.max(...audioFeatures.map((track) => track.danceability));
        let lowestEnergy = Math.min(...audioFeatures.map((track) => track.energy));
        let highestEnergy = Math.max(...audioFeatures.map((track) => track.energy));
        let lowestLoudness = Math.min(...audioFeatures.map((track) => track.loudness));
        let highestLoudness = Math.max(...audioFeatures.map((track) => track.loudness));
        let lowestSpeechiness = Math.min(...audioFeatures.map((track) => track.speechiness));
        let highestSpeechiness = Math.max(...audioFeatures.map((track) => track.speechiness));
        let lowestAcousticness = Math.min(...audioFeatures.map((track) => track.acousticness));
        let highestAcousticness = Math.max(...audioFeatures.map((track) => track.acousticness));
        let lowestInstrumentalness = Math.min(...audioFeatures.map((track) => track.instrumentalness));
        let highestInstrumentalness = Math.max(...audioFeatures.map((track) => track.instrumentalness));
        let lowestLiveness = Math.min(...audioFeatures.map((track) => track.liveness));
        let highestLiveness = Math.max(...audioFeatures.map((track) => track.liveness));
        let lowestValence = Math.min(...audioFeatures.map((track) => track.valence));
        let highestValence = Math.max(...audioFeatures.map((track) => track.valence));
        let lowestTempo = Math.min(...audioFeatures.map((track) => track.tempo));
        let highestTempo = Math.max(...audioFeatures.map((track) => track.tempo));

        const randomTrackIds = [];
        const randomAmount = currentlyPlayingSong ? 2 : 3;
        for (let i = 0; i < randomAmount; i++) {
            const randomIndex = Math.floor(Math.random() * songIds.length);
            randomTrackIds.push(songIds[randomIndex]);
        }
        if (currentlyPlayingSong) {
            randomTrackIds.push(currentlyPlayingId);
        }

        const recommendations = await this.makeSpotifyApiCall(() => this.spotifyApi.getRecommendations({
            ...(genre && {seed_genres: genre}),
            seed_tracks: randomTrackIds,
            limit: 50,
            min_danceability: lowestDanceability,
            max_danceability: highestDanceability,
            min_energy: lowestEnergy,
            max_energy: highestEnergy,
            min_loudness: lowestLoudness,
            max_loudness: highestLoudness,
            min_speechiness: lowestSpeechiness,
            max_speechiness: highestSpeechiness,
            min_acousticness: lowestAcousticness,
            max_acousticness: highestAcousticness,
            min_instrumentalness: lowestInstrumentalness,
            max_instrumentalness: highestInstrumentalness,
            min_liveness: lowestLiveness,
            max_liveness: highestLiveness,
            min_valence: lowestValence,
            max_valence: highestValence,
            min_tempo: lowestTempo,
            max_tempo: highestTempo,
        }), id);

        const descriptions = [];
        if (mostPlayed) descriptions.push('most played songs');
        if (likedSongs) descriptions.push('liked songs');
        if (recentlyPlayed) descriptions.push('recently played songs');
        if (currentlyPlayingSong) descriptions.push('currently playing song & recently played songs');

        const description = `This playlist is generated based on: ${descriptions.join(', ')}.`;
        const playlist = await this.makeSpotifyApiCall(() => this.spotifyApi.createPlaylist('Recommendations', {
            description: description,
            public: false,
            collaborative: false,
        }), id);

        const songUris = recommendations.body.tracks.map((song) => song.uri);

        return await this.addTracksToPlaylistAndRetrieve(songUris, playlist, id);
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
        await knex('users').insert({
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
        await knex('users').where('user_id', id).del().catch((err) => {
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
