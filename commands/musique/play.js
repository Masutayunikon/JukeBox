const dotenv = require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const fetch = require('node-fetch');
const request = require('request');
const spawn = require('child_process').exec;
const client_id = process.env.SPOTIFY_CLIENT_ID;
const { AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel} = require('@discordjs/voice');
const {existsSync} = require("node:fs");

const player = createAudioPlayer();

player.on(AudioPlayerStatus.Idle, () => {
    console.log('Player is idle.');
});

player.on('error', error => {
    console.error(`Error: ${error.message} with resource ${error.resource.metadata.title}`);
});

player.on(AudioPlayerStatus.Playing, () => {
    console.log('Player is playing.');
});





let authOptions = {
    method: 'POST',
    headers: {
        'Authorization': 'Basic ' + (new Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')),
        'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: "grant_type=client_credentials"
};

const regex = /^(https?:\/\/open\.spotify\.com\/(playlist|intl-\w+\/track)\/([a-zA-Z0-9]+)\?si=([a-zA-Z0-9]+))$/;


module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a spotify song or playlist.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the song or playlist.')),
    async execute(interaction) {

        // check if the link match the regex
        const link = interaction.options.getString('link');

        if (!regex.test(link)) {
            await interaction.reply('The link is not valid.');
            return;
        }

        await interaction.reply('The link is valid.');

        let token = '';

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', authOptions);

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            const data = await response.json();
            token = data.access_token;

            // Replace this with your code
            //console.log(token);

        } catch (error) {
            console.log('Error:', error);
        }

        // if the link is a playlist get each song
        let songs = [];

        if (link.includes('playlist')) {
            const playlistId = link.split('/')[4];
            const playlistUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
            const playlistOptions = {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            };

            try {
                const response = await fetch(playlistUrl, playlistOptions);

                if (!response.ok) {
                    throw new Error(response.statusText);
                }

                const data = await response.json();

                for (const track of data.tracks.items) {
                    console.log(track.track.name);
                }

                // execute zotify
                const command = `zotify ${data.tracks.items[0].track.external_urls.spotify}` + ' --download-lyrics=False --print-skips=false --download-format=mp3 --download-quality=very_high --root-path=./songs --print-download-progress=false --print-errors=false --print-downloads=true';

                spawn(command, async (error, stdout, stderr) => {
                    if (error) {
                        console.error(`exec error: ${error}`);
                        return;
                    }
                    console.log(`stdout: ${stdout}`);

                    const regex = /Downloaded "(.+)" to "(.+)"/;

                    const matches = stdout.match(regex);

                    if (matches) {
                        const song = matches[1];
                        const directory = matches[2];
                        console.log(`Song: ${song}`);
                        console.log(`Directory: ${directory}`);


                        //console.log(interaction.member.voice);
                        // connect to the user voice channel
                        const channel = interaction.member.voice.channel;


                        if (channel && song && directory) {
                            const connection = joinVoiceChannel({
                                channelId: channel.id,
                                guildId: channel.guild.id,
                                adapterCreator: channel.guild.voiceAdapterCreator,
                                selfDeaf: false,
                            });
                            const resource = createAudioResource('./songs/' + directory)

                            console.log('./songs/' + directory);
                            // check if the path is correct
                            console.log(existsSync('./songs/' + directory));
                            console.log(resource);

                            player.play(resource);

                            const subscription = connection.subscribe(player);

                            if (subscription) {
                                // Unsubscribe after 5 seconds (stop playing audio on the voice connection)
                                setTimeout(() => subscription.unsubscribe(), 100_000);
                            }
                        } else {
                            await interaction.reply('You need to join a voice channel first!');
                        }
                    } else {
                        console.log("No match found.");
                    }

                });

            } catch (error) {
                console.log('Error:', error);
            }
        }
    },
};
