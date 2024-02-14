const {MAX, MAX_RECOMMENDATIONS} = require('../utils/constants');

class Recommendations {
    constructor(spotify) {
        this.spotify = spotify;
        this.spotifyApi = spotify.spotifyApi;
    }

    async createRecommendationPlaylist(id, options = {}) {

        if (!this.#hasValidOptions(options)) {
            return {error: 'No options selected.'};
        }

        const songIds = await this.#fetchSongsBasedOnConditions(id, options);
        if (songIds.length === 0) {
            return {error: 'No songs found.'};
        }

        const recommendations = await this.#getRecommendations(id, songIds, options);
        const playlist = await this.#createPlaylist(id, options);

        const songUris = recommendations.body.tracks.map(song => song.uri);
        return await this.spotify.addTracksToPlaylistAndRetrieve(songUris, playlist, id);
    }

    #hasValidOptions(options) {
        return Object.values(options).some(value => value);
    }

    async #fetchSongsBasedOnConditions(id, options) {
        const songIds = [];
        for (const [condition, value] of Object.entries(options)) {
            if (value) {
                const songs = await this.spotify.fetchSongs(id, condition, MAX, true);
                songIds.push(...songs);
            }
        }
        return songIds;
    }

    async #getRecommendations(id, songIds, options) {
        const {genre, useTrackSeeds, useAudioFeatures, targetValues} = options;
        const randomTrackIds = songIds.sort(() => 0.5 - Math.random()).slice(0, 3);
        return await this.spotify.makeSpotifyApiCall(() => this.spotifyApi.getRecommendations({
            ...(genre && {seed_genres: genre}),
            ...(useTrackSeeds && {seed_tracks: randomTrackIds}),
            limit: MAX_RECOMMENDATIONS,
            ...(useAudioFeatures && this.#getAudioFeatures(songIds, id)),
            ...this.#getTargetValues(targetValues)
        }), id);
    }

    async #getAudioFeatures(songIds, id) {
        const audioFeatures = await this.spotify.getAudioFeatures(songIds, id);
        const featureKeys = ['danceability', 'energy', 'loudness', 'speechiness', 'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo'];
        return featureKeys.reduce((features, key) => {
            features[`min_${key}`] = Math.min(...audioFeatures.map(track => track[key]));
            features[`max_${key}`] = Math.max(...audioFeatures.map(track => track[key]));
            return features;
        }, {});
    }

    #getTargetValues(targetValues) {
        return Object.entries(targetValues).filter(([key, value]) => value !== '').reduce((targets, [key, value]) => {
            targets[`target_${key}`] = value;
            return targets;
        }, {});
    }

    async #createPlaylist(id, options) {
        const descriptions = Object.entries(options).filter(([key, value]) => value).map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase());
        const description = `This playlist is generated based on: ${descriptions.join(', ')}.`;
        return await this.spotify.makeSpotifyApiCall(() => this.spotifyApi.createPlaylist('Recommendations', {
            description: description,
            public: false,
            collaborative: false,
        }), id);
    }
}

module.exports = Recommendations;