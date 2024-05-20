import SpotifyWebApi from 'spotify-web-api-node'
import request from 'request'
import Recommendations from './Recommendations.js'
import {MAX} from '../utils/constants.js'
import db from '../db/database.js'
import crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config();

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
        this.isRateLimited = false;

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
            try {
                if (this.isRateLimited) {
                    throw new Error('Rate limit exceeded. Please wait before making more requests.');
                }

                const user = await db('users').where('user_id', id).first();
                if (!user) {
                    throw new Error('User not found in the database.');
                }
                this.setSpotifyTokens(user.access_token, user.refresh_token);
                this.apiCallCount++;
                console.log('API call count:', this.apiCallCount);
                return await apiCall();
            } catch (error) {
                console.log('Error:', error);
                if (error.statusCode === 429) {
                    const retryAfter = error.headers['retry-after'] * 1000; // Convert seconds to milliseconds
                    console.log(`Rate limited. Retrying after ${retryAfter} milliseconds...`);
                    this.isRateLimited = true;
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    this.isRateLimited = false;
                    return this.makeSpotifyApiCall(apiCall, id); // Retry the API call
                } else {
                    const refreshToken = await this.getRefreshToken(id);
                    await this.handleTokenRefresh(refreshToken);
                    return this.makeSpotifyApiCall(apiCall, id); // Retry the API call
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
            console.error('Error while fetching Spotify user:', error);
            console.log('Attempting to refresh token and retry...');

            try {
                await this.handleTokenRefresh(user.refresh_token);
            } catch (error) {
                throw new Error('Failed to refresh Spotify token: ' + error.message);
            }

            try {
                me = await this.spotifyApi.getMe();
            } catch (error) {
                console.error('Failed to retrieve Spotify user after refreshing token:', error);
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
                Authorization: `Basic ${Buffer.from(this.clientId + ':' + this.clientSecret).toString('base64')}`,
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
                    resolve({
                        access_token: body.access_token,
                        refresh_token: body.refresh_token || refreshToken,
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
     * @param {number} [offset=0] - The offset to start from. Default is 0.
     * @param {string | undefined} genre - The genre to retrieve the tracks for
     * @param {boolean} random - Whether to retrieve random tracks
     * @returns {Promise} - The tracks
     * @throws {Error} - Failed to retrieve tracks
     */
    async getTracks(id, spotifyApiMethod, total = MAX, offset = 0, genre = undefined, random = false) {
        try {
            if (random){
                offset = Math.floor(Math.random() * 11);
            }
            let tracks = [];
            let filteredTracks = [];

            if (genre) {
                while (filteredTracks.length < 5) {
                    tracks = await this.makeSpotifyApiCall(() => spotifyApiMethod({limit: total, offset: offset}), id);
                    filteredTracks = await this.filterTracksByGenre(tracks.body.items, genre);
                    offset += total;
                }
                return {items: filteredTracks};
            } else {
                tracks = await this.makeSpotifyApiCall(() => spotifyApiMethod({limit: total, offset: offset}), id);
                return tracks.body;
            }
        } catch (error) {
            throw new Error('Failed to retrieve tracks: ' + error.message);
        }
    }

    async filterTracksByGenre(songs, genre, id) {
        const filteredTracks = [];

        for (const song of songs) {
            let found = false;
            for (const songArtist of song.track.artists) {
                const artist = await this.makeSpotifyApiCall(() => this.spotifyApi.getArtist(songArtist.id), id);
                if (artist.body.genres.includes(genre)) {
                    found = true;
                    break;
                }
            }
            if (found) {
                filteredTracks.push(song);
            }
        }
        return filteredTracks;
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
                const mostPlayedTracks = await this.getTracks(id, this.spotifyApi.getMyTopTracks.bind(this.spotifyApi), max, 0, genre, random);
                return mostPlayedTracks.items.map((song) => song.id);
            case 'likedTracks':
                const likedTracks = await this.getTracks(id, this.spotifyApi.getMySavedTracks.bind(this.spotifyApi), max, 0, genre, random);
                return likedTracks.items.map((song) => song.track.id);
            case 'recentlyPlayed':
                const recentlyPlayedTracks = await this.getTracks(id, this.spotifyApi.getMyRecentlyPlayedTracks.bind(this.spotifyApi), max, 0, genre, random);
                return recentlyPlayedTracks.items.map((song) => song.track.id);
            default:
                return [];
        }
    }

    /**
     * Find a playlist by name
     * @param {string} id - The user's ID
     * @param {string} filter - The name of the playlist to find
     * @param {number} limit - The maximum amount of playlists to retrieve
     * @returns {Promise} - The found playlist
     */
    async findPlaylist(id, filter, limit = MAX) {
        let page = 1;
        while (true) {
            const playlists = await this.getPlaylists(id, limit, (page - 1) * limit);
            for (const playlist of playlists.items) {
                if (playlist.name.includes(filter)) {
                    return playlist;
                }
            }
            if (playlists.items.length < limit) {
                break; // No more playlists
            }
            page++;
        }
        return null;
    }

    /**
     * Filter liked songs and create a playlist
     * @param {string} id - The user's ID
     * @param {array} filter - The filter to apply to the liked songs (e.g. [' artist:Ed Sheeran', ' artist:Justin Bieber'])
     * @param {string} playlistName - The name of the playlist to create
     * @returns {Promise} - The created playlist
     */
    async createFilteredPlaylist(id, filter, playlistName = undefined) {
        let playlist;
        if (!playlistName) {
            const artists = filter.map((f) => f.split(':')[1]);
            playlistName = `Liked Tracks - ${artists.join(' , ')}`;
        }

        const existingPlaylist = await this.findPlaylist(id, playlistName);
        if (existingPlaylist) {
            return existingPlaylist;
        }

        try {
            playlist = await this.makeSpotifyApiCall(() =>
                this.spotifyApi.createPlaylist(playlistName, {
                    description: `This playlist is generated with your liked songs filtered by ${filter}.`,
                    public: true,
                    collaborative: false,
                }), id
            );
        } catch (error) {
            console.error('Failed to create playlist:', error);
            throw new Error('Failed to create playlist');
        }
        if (!playlist || !playlist.body) {
            throw new Error('Playlist is undefined or does not have a body property');
        }
        // Return the playlist
        return playlist.body;
    }

    /**
     * Add tracks to a playlist in the background
     * @param {string} id - The user's ID
     * @param {string} playlistId
     * @param {array} filters - The filter to apply to the liked songs (e.g. [' artist:Ed Sheeran', ' artist:Justin Bieber'])
     * @returns {Promise<void>}
     */
    async addTracksToPlaylistInBackground(id, playlistId, filters) {
        // Fetch and filter tracks
        let likedTracks = [];
        let offset = 0;
        let limit = MAX;
        let total = 1;

        const addedTracks = new Set(); // Set to store track URIs that have been added

        // Fetch the tracks that are already in the playlist
        const playlistTracksResponse = await this.makeSpotifyApiCall(() => this.spotifyApi.getPlaylistTracks(playlistId), id);
        const playlistTracks = playlistTracksResponse.body.items.map(item => item.track.id);

        let foundInPlaylist = false; // Flag to indicate if a song is found in the playlist

        while (likedTracks.length < total && !foundInPlaylist) {
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

            for (const song of songs) {
                // If the song is already in the playlist, stop fetching and filtering
                if (playlistTracks.includes(song.track.id)) {
                    foundInPlaylist = true;
                    break;
                }
                likedTracks.push(song);
            }

            for (const filter of filters) {
                // Extract the artist name from the filter
                const artist = filter.split(':')[1];

                if (artist) {
                    await this.addFilteredTracksToPlaylist(id, playlistId, await this.filterTracksByArtist(likedTracks, artist, id), addedTracks);
                } else {
                    console.error('Invalid filter:', filter);
                    return;
                }
            }
        }
    }

    /**
     * Add filtered tracks to the playlist
     * @param {string} id - The user's ID
     * @param {string} playlistId - The ID of the playlist
     * @param {Array} filteredTracks - The filtered tracks
     * @param {Set} addedTracks - The set of track URIs that have been added
     * @returns {Promise<void>}
     */
    async addFilteredTracksToPlaylist(id, playlistId, filteredTracks, addedTracks) {
        const chunkSize = 100;
        for (let i = 0; i < filteredTracks.length; i += chunkSize) {
            const chunk = filteredTracks.slice(i, i + chunkSize);
            const songUris = chunk.map(song => song.track.uri).filter(uri => !addedTracks.has(uri)); // Filter out duplicates
            try {
                if (songUris.length > 0) {
                    await this.makeSpotifyApiCall(() => this.spotifyApi.addTracksToPlaylist(playlistId, songUris), id);
                    songUris.forEach(uri => addedTracks.add(uri)); // Add new track URIs to the set
                }
            } catch (error) {
                console.error('Failed to add tracks to playlist:', error);
                return;
            }
        }
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
        const playlists = await this.makeSpotifyApiCall(() => this.spotifyApi.getUserPlaylists(user.id, {
            limit: amount,
            offset: offset
        }), id);
        return playlists.body;
    }

    /**
     * Filter liked songs by artist
     * @param {Array} songs - The liked songs
     * @param {array} artist - The artist to filter the songs by
     * @param {string} id - The user's ID
     * @returns {Promise<Array>} - The filtered songs
     */
    async filterTracksByArtist(songs, artist, id) {
        const filteredTracks = [];
        const artistId = await this.getArtistId(artist, id);

        for (const song of songs) {
            let found = false;
            for (const songArtist of song.track.artists) {
                if (songArtist.id === artistId) {
                    found = true;
                    break;
                }
            }
            if (found) {
                filteredTracks.push(song);
            }
        }
        return filteredTracks;
    }

    /**
     * Get the artist ID
     * @param {string} artist - The artist to get the ID for
     * @param {string} id - The user's ID
     * @returns {Promise<string>} - The artist ID
     */
    async getArtistId(artist, id) {
        const artists = await this.makeSpotifyApiCall(() => this.spotifyApi.searchArtists(artist), id);
        return artists.body.artists.items[0].id;
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
                        const api_token = crypto.createHash('sha256').update(id + access_token).digest('hex');
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

export default Spotify;
