import { MAX, MAX_RECOMMENDATIONS, checkAmount } from '../utils/constants.js';

class Recommendations {
    constructor(spotify) {
        this.spotify = spotify;
        this.spotifyApi = spotify.spotifyApi;
    }

    async createRecommendationPlaylist(id, options = {}, amount = MAX) {
        amount = checkAmount(amount);
        if (!this.#hasValidOptions(options)) {
            return {error: 'No options selected.'};
        }

        const songIds = await this.#fetchTracksBasedOnConditions(id, options, amount);
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

    async #fetchTracksBasedOnConditions(id, options, amount = MAX) {
        const genre = options.genre;
        const songIds = [];
        const conditions = {...options}; // Create a copy of the options object
        delete conditions.genre; // Remove the genre property from the conditions object
        for (const [condition, value] of Object.entries(conditions)) {
            if (value) {
                try {
                    const songs = await this.spotify.fetchTracks(id, condition, amount, true, genre);
                    songIds.push(...songs);
                } catch (error) {
                    console.error(`Error fetching songs for condition ${condition}:`, error);
                }
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

    async #getTargetValues(targetValues) {
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

export default Recommendations;