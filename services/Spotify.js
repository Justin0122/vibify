import SpotifyWebApi from 'spotify-web-api-node'
import axios from 'axios';
import Recommendations from './Recommendations.js'
import {MAX} from '../utils/constants.js'
import db from '../db/database.js'
import crypto from 'crypto'
import dotenv from 'dotenv'
import redisClient from "../redisClient.js";
import redis from "../redisClient.js";

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
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        const REQUEST_DELAY = 20; // Delay in milliseconds

        const cacheKey = `spotifyApiCall:${id}:${apiCall.name}`;

        try {
            const cachedResult = await redis.get(cacheKey);
            if (cachedResult) {
                console.log('Cache hit!');
                return JSON.parse(cachedResult);
            }

            if (this.isRateLimited) {
                await this.rateLimitPromise;
            }
            const user = await db('users').where('user_id', id).first();
            if (!user) throw new Error('User not found in the database.');

            // Check if the token is expired
            const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
            const tokenIssuedTime = Math.floor(new Date(user.updated_at).getTime() / 1000); // Token issued time in seconds
            const tokenExpirationTime = 3600; // Token expiration time in seconds

            if (currentTime - tokenIssuedTime >= tokenExpirationTime) {
                // Token is expired, refresh it
                const refreshedTokens = await this.refreshAccessToken(user.refresh_token);
                await db('users').where('user_id', id).update({
                    access_token: refreshedTokens.access_token,
                    refresh_token: refreshedTokens.refresh_token,
                    updated_at: db.fn.now(), // Update the token issued time
                });

                this.setSpotifyTokens(refreshedTokens.access_token, refreshedTokens.refresh_token);
            } else {
                this.setSpotifyTokens(user.access_token, user.refresh_token);
            }

            this.apiCallCount++;
            console.log('API call count:', this.apiCallCount);
            await delay(REQUEST_DELAY);
            const result = await apiCall();
            await redis.setex(cacheKey, 3600, JSON.stringify(result));

            return result;
        } catch (error) {
            console.error('Error:', error);
            if (error.statusCode === 429) {
                const retryAfter = error.headers['retry-after'] * 1000; // Convert seconds to milliseconds
                console.error(`Rate limited. Retrying after ${retryAfter} milliseconds...`);
                this.isRateLimited = true;
                // Create a new promise that resolves after the wait time
                this.rateLimitPromise = new Promise(resolve => setTimeout(resolve, retryAfter));
                await this.rateLimitPromise;
                this.isRateLimited = false;
                this.rateLimitPromise = null; // Reset the promise
                return this.makeSpotifyApiCall(apiCall, id); // Retry the API call
            } else {
                await this.handleTokenRefresh(await this.getRefreshToken(id));
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
        const cacheKey = `user:${id}`;
        const cachedUser = await new Promise((resolve, reject) => {
            redis.get(cacheKey, (err, result) => {
                if (err) reject(err);
                resolve(result ? JSON.parse(result) : null);
            });
        });
        if (cachedUser) return cachedUser;
        const user = await db('users').where('user_id', id).first().catch(error => {
            throw new Error(`Error while fetching user from the database: ${error.message}`);
        });
        if (!user) return {error: 'User not found in the database.'};

        this.setSpotifyTokens(user.access_token, user.refresh_token);

        try {
            const spotifyUser = (await this.makeSpotifyApiCall(() => this.spotifyApi.getMe(), id)).body;
            await redis.setex(cacheKey, 3600, JSON.stringify(spotifyUser));
            return spotifyUser;
        } catch (error) {
            console.error('Error while fetching Spotify user:', error);
            console.log('Attempting to refresh token and retry...');

            try {
                await this.handleTokenRefresh(user.refresh_token);
                const spotifyUser = (await this.makeSpotifyApiCall(() => this.spotifyApi.getMe(), id)).body;
                await redis.setex(cacheKey, 3600, JSON.stringify(spotifyUser));
                return spotifyUser;
            } catch (error) {
                console.error('Failed to retrieve Spotify user after refreshing token:', error);
                throw new Error(`Failed to retrieve Spotify user after refreshing token: ${error.message}`);
            }
        }
    }

    /**
     * Get the user's Spotify refresh token
     * @param {string} id - The user's ID
     * @returns {Promise} - The user's Spotify refresh token
     */
    async getRefreshToken(id) {
        const user = await db('users').where('user_id', id).first();
        if (!user) throw new Error('User not found in the database.');
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
                Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
            },
            data: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        };

        try {
            const {data} = await axios.post(authOptions.url, authOptions.data, {headers: authOptions.headers});
            return {
                access_token: data.access_token,
                refresh_token: data.refresh_token || refreshToken,
            };
        } catch (error) {
            throw error;
        }
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
            return (await this.makeSpotifyApiCall(() => this.spotifyApi.getMyCurrentPlayingTrack(), id)).body;
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
        console.log('Getting tracks...');
        try {
            if (random) offset = Math.floor(Math.random() * 11);
            this.tracks = [];
            this.filteredTracks = [];

            const cacheKey = `tracks:${id}:${spotifyApiMethod.name}:${total}:${offset}:${genre || 'any'}`;
            const cachedTracks = await new Promise((resolve, reject) => {
                redis.get(cacheKey, (err, result) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(result ? JSON.parse(result) : null);
                });
            });
            if (cachedTracks) return cachedTracks;

            if (!genre) {
                this.tracks = await this.makeSpotifyApiCall(() => spotifyApiMethod({limit: total, offset}), id);
                await redis.setex(cacheKey, 3600, JSON.stringify(this.tracks.body))
                return this.tracks.body;
            }
            while (this.filteredTracks.length < 5) {
                this.tracks = await this.makeSpotifyApiCall(() => spotifyApiMethod({limit: total, offset}), id);
                this.filteredTracks = await this.filterTracksByGenre(this.tracks.body.items, genre, id);
                offset += total;
            }

            await redis.setex(cacheKey, 3600, JSON.stringify({items: this.filteredTracks})).then(() => {
            }).catch((err) => {
                console.error(`Failed to set cache for key: ${cacheKey}`, err);
            });

            return {items: this.filteredTracks};
        } catch (error) {
            console.error('Error in getTracks:', error);
            throw new Error(`Failed to retrieve tracks: ${error.message}`);
        }
    }

    async filterTracksByGenre(songs, genre, id) {
        const filteredTracks = [];

        for (const song of songs) {
            const found = await Promise.any(song.track.artists.map(async (songArtist) => {
                const cacheKey = `artist:${songArtist.id}:genres`;
                let artistGenres = await new Promise((resolve, reject) => {
                    redisClient.get(cacheKey, (err, result) => {
                        if (err) reject(err);
                        resolve(result ? JSON.parse(result) : null);
                    });
                });

                if (artistGenres) console.log(`Cache hit for artist genres: ${cacheKey} - ${artistGenres}`);
                else {
                    try {
                        const artist = await this.makeSpotifyApiCall(() => this.spotifyApi.getArtist(songArtist.id), id);
                        artistGenres = artist.body.genres;
                        await redisClient.setex(cacheKey, 3600, JSON.stringify(artistGenres)); // Cache for 1 hour
                    } catch (error) {
                        console.error(`Error fetching artist ${songArtist.id}:`, error);
                        return false;
                    }
                }
                return artistGenres.includes(genre);
            }));

            if (found) filteredTracks.push(song);
        }
        return filteredTracks;
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
            if (songsFromMonth.length === 0) return
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
        const likedTracks = [];
        const limit = MAX;
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        let offset = 0;
        let total = 1;

        while (likedTracks.length < total) {
            const response = await this.makeSpotifyApiCall(() => this.spotifyApi.getMySavedTracks({limit, offset}), id);
            const songs = response.body.items;
            total = response.body.total;
            offset += limit;

            const firstAddedAt = new Date(songs[0].added_at);
            if (firstAddedAt < startDate || (firstAddedAt > endDate && likedTracks.length > 0)) break;

            if (genre) {
                const artistIds = songs.map(song => song.track.artists[0].id);
                const artists = await this.makeSpotifyApiCall(() => this.spotifyApi.getArtists(artistIds), id);
                const artistGenres = artists.body.artists.reduce((acc, artist) => {
                    acc[artist.id] = artist.genres;
                    return acc;
                }, {});

                songs.forEach(song => {
                    const addedAt = new Date(song.added_at);
                    if (addedAt >= startDate && addedAt <= endDate && artistGenres[song.track.artists[0].id].includes(genre)) {
                        likedTracks.push(song);
                    }
                });
            } else {
                likedTracks.push(...songs.filter(song => {
                    const addedAt = new Date(song.added_at);
                    return addedAt >= startDate && addedAt <= endDate;
                }));
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
        const audioFeatures = [];

        while (audioFeatures.length < total) {
            const response = await this.makeSpotifyApiCall(() =>
                this.spotifyApi.getAudioFeaturesForTracks(tracksIds.slice(offset, offset + limit)), id);
            audioFeatures.push(...response.body.audio_features);
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
        const songIds = playlistTracks.body.items.map(song => song.track.id);
        return this.getAudioFeatures(songIds, id);
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
        const fetchMethods = {
            currentlyPlaying: async () => {
                const currentlyPlaying = await this.getCurrentlyPlaying(id);
                return [currentlyPlaying.item.id];
            },
            mostPlayed: async () => {
                const mostPlayedTracks = await this.getTracks(id, this.spotifyApi.getMyTopTracks.bind(this.spotifyApi), max, 0, genre, random);
                return mostPlayedTracks.items.map(song => song.id);
            },
            likedTracks: async () => {
                const likedTracks = await this.getTracks(id, this.spotifyApi.getMySavedTracks.bind(this.spotifyApi), max, 0, genre, random);
                return likedTracks.items.map(song => song.track.id);
            },
            recentlyPlayed: async () => {
                const recentlyPlayedTracks = await this.getTracks(id, this.spotifyApi.getMyRecentlyPlayedTracks.bind(this.spotifyApi), max, 0, genre, random);
                return recentlyPlayedTracks.items.map(song => song.track.id);
            }
        };
        return fetchMethods[condition] ? await fetchMethods[condition]() : [];
    }

    /**
     * Find a playlist by name
     * @param {string} id - The user's ID
     * @param {string} filter - The name of the playlist to find
     * @param {number} limit - The maximum amount of playlists to retrieve
     * @returns {Promise} - The found playlist
     */
    async findPlaylist(id, filter, limit = MAX) {
        const findPlaylistRecursive = async (page) => {
            const playlists = await this.getPlaylists(id, limit, (page - 1) * limit);
            for (const playlist of playlists.items) {
                if (playlist.name.includes(filter)) {
                    return playlist;
                }
            }
            if (playlists.items.length < limit) {
                return null; // No more playlists
            }
            return findPlaylistRecursive(page + 1);
        };
        return findPlaylistRecursive(1);
    }

    /**
     * Filter liked songs and create a playlist
     * @param {string} id - The user's ID
     * @param {array} filter - The filter to apply to the liked songs (e.g. [' artist:Ed Sheeran', ' artist:Justin Bieber'])
     * @param {string} playlistName - The name of the playlist to create
     * @returns {Promise} - The created playlist
     */
    async createFilteredPlaylist(id, filter, playlistName = undefined) {
        const artists = filter.map((f) => f.split(':')[1]);
        const finalPlaylistName = playlistName || `Liked Tracks - ${artists.join(' , ')}`;

        const existingPlaylist = await this.findPlaylist(id, finalPlaylistName);
        if (existingPlaylist) return existingPlaylist;

        try {
            const playlist = await this.makeSpotifyApiCall(() =>
                this.spotifyApi.createPlaylist(finalPlaylistName, {
                    description: `This playlist is generated with your liked songs filtered by ${filter}.`,
                    public: true,
                    collaborative: false,
                }), id
            );

            if (!playlist || !playlist.body) throw new Error('Playlist is undefined or does not have a body property');

            return playlist.body;
        } catch (error) {
            console.error('Failed to create playlist:', error);
            throw new Error('Failed to create playlist');
        }
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
        const likedTracks = [];
        const limit = MAX;
        const addedTracks = new Set(); // Set to store track URIs that have been added

        // Fetch the tracks that are already in the playlist
        const playlistTracksResponse = await this.makeSpotifyApiCall(() => this.spotifyApi.getPlaylistTracks(playlistId), id);
        const playlistTracks = playlistTracksResponse.body.items.map(item => item.track.id);

        let foundInPlaylist = false; // Flag to indicate if a song is found in the playlist
        let total = 1;
        let offset = 0;

        while (likedTracks.length < total && !foundInPlaylist) {
            let response;
            try {
                response = await this.makeSpotifyApiCall(() => this.spotifyApi.getMySavedTracks({
                    limit: limit,
                    offset: offset
                }), id);
            } catch (error) {
                return console.error('Failed to get saved tracks:', error);
            }
            const songs = response.body.items;
            total = response.body.total;
            offset += limit;

            songs.some(song => {
                if (playlistTracks.includes(song.track.id)) {
                    foundInPlaylist = true;
                    return true;
                }
                likedTracks.push(song);
                return false;
            });

            for (const filter of filters) {
                const artist = filter.split(':')[1]; // e.g. 'artist:Ed Sheeran' -> 'Ed Sheeran'
                if (!artist) return console.error(`Invalid filter: ${filter}`);
                await this.addFilteredTracksToPlaylist(id, playlistId, await this.filterTracksByArtist(likedTracks, artist, id), addedTracks);
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
            const songUris = filteredTracks.slice(i, i + chunkSize)
                .map(song => song.track.uri)
                .filter(uri => !addedTracks.has(uri)); // Filter out duplicates
            if (songUris.length > 0) {
                try {
                    await this.makeSpotifyApiCall(() => this.spotifyApi.addTracksToPlaylist(playlistId, songUris), id);
                    songUris.forEach(uri => addedTracks.add(uri)); // Add new track URIs to the set
                } catch (error) {
                    console.error('Failed to add tracks to playlist:', error);
                    return;
                }
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
        return (await this.makeSpotifyApiCall(() =>
            this.spotifyApi.getUserPlaylists(user.id, {limit: amount, offset}), id)).body;
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
            const found = song.track.artists.some(songArtist => songArtist.id === artistId);
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
        const {body: {artists: {items}}} = await this.makeSpotifyApiCall(() => this.spotifyApi.searchArtists(artist), id);
        return items[0].id;
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
        try {
            await db('users').insert({
                user_id: id,
                access_token,
                refresh_token,
                expires_in,
                api_token,
            });
        } catch (err) {
            console.log("Error inserting user into database: ", err);
            return err;
        }
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
     * @returns {Promise<{api_token: string, userId: string}>}
     */
    async authorizationCodeGrant(code, id) {
        try {
            const data = await this.spotifyApi.authorizationCodeGrant(code);
            const {access_token, refresh_token, expires_in} = data.body;
            const api_token = crypto.createHash('sha256').update(id + access_token).digest('hex');
            await this.insertUserIntoDatabase(id, access_token, refresh_token, expires_in, api_token);
            return {api_token, userId: id};
        } catch (err) {
            console.log('Something went wrong!', err);
            throw err;
        }
    }
}

export default Spotify;
