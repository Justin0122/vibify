# Vibify

Vibify is a Spotify API wrapper designed to handle several Spotify API calls. It provides a simple and efficient way to interact with the Spotify API using JavaScript.

## Features

- Get user's Spotify information
- Get user's currently playing track
- Get user's top tracks
- Get user's last listened tracks
- Get user's top artists
- Create a playlist for a specific month and year
- Get user's liked songs
- Get audio features for specified tracks
- Create a recommendation playlist
- Get user's top genre(s)
- Logout (delete user from the database)

## Installation

This project uses npm for package management. To install all the dependencies, run the following command:

```bash
npm install
```

## Usage

To use the Spotify API, you need to create a Spotify Developer account and create an application. After creating an application, you will receive a client ID and a client secret. You will also need to set the redirect URI in the application settings. More information can be found [here](https://developer.spotify.com/documentation/general/guides/app-settings/).

My API expects you to have your own server to handle the authentication process, but this will be built-in in the future.


## Notes

This project is still in development and is not yet ready for production. The API is subject to change and may not be stable.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.